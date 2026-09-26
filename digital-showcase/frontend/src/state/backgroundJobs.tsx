import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { api } from "../api/client";
import type { ProductImageSelection, ProductPayload } from "../components/product-form";
import type { Product } from "../types/models";

export type BackgroundJobStatus = "running" | "done" | "error";

export interface BackgroundJob {
  id: string;
  title: string;
  storeId: string;
  status: BackgroundJobStatus;
  percent: number;
  message: string;
}

interface QueueProductSaveArgs {
  storeId: string;
  productId?: string;
  payload: ProductPayload;
  imageSelection: ProductImageSelection;
  existingImageIds: string[];
}

interface BackgroundJobsContextValue {
  jobs: BackgroundJob[];
  queueProductSave: (args: QueueProductSaveArgs) => string;
  dismissJob: (id: string) => void;
}

const BackgroundJobsContext = createContext<BackgroundJobsContextValue | null>(null);

// Rough weight of each step in the overall product-save sequence, used to
// turn a series of sequential API calls into a single 0-100% number. Upload
// gets the biggest share since it's normally the slowest part (large images
// on a weak connection).
const WEIGHT_SAVE = 10;
const WEIGHT_DELETE = 10;
const WEIGHT_UPLOAD = 70;
const WEIGHT_ORDER = 10;

export function BackgroundJobsProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<BackgroundJob[]>([]);
  const counterRef = useRef(0);

  const updateJob = useCallback((id: string, patch: Partial<BackgroundJob>) => {
    setJobs((current) => current.map((job) => (job.id === id ? { ...job, ...patch } : job)));
  }, []);

  const dismissJob = useCallback((id: string) => {
    setJobs((current) => current.filter((job) => job.id !== id));
  }, []);

  const queueProductSave = useCallback(
    ({ storeId, productId, payload, imageSelection, existingImageIds }: QueueProductSaveArgs) => {
      const id = `job-${Date.now()}-${counterRef.current++}`;
      const job: BackgroundJob = {
        id,
        title: payload.title || "Новый товар",
        storeId,
        status: "running",
        percent: 1,
        message: "Сохраняем товар…"
      };
      setJobs((current) => [...current, job]);

      runProductSave({ storeId, productId, payload, imageSelection, existingImageIds }, (patch) => updateJob(id, patch))
        .then(() => {
          updateJob(id, { status: "done", percent: 100, message: "Товар сохранён" });
          window.setTimeout(() => dismissJob(id), 6000);
        })
        .catch((err: any) => {
          updateJob(id, {
            status: "error",
            message: err?.response?.data?.message ?? "Не удалось сохранить товар"
          });
        });

      return id;
    },
    [updateJob, dismissJob]
  );

  const value = useMemo(() => ({ jobs, queueProductSave, dismissJob }), [jobs, queueProductSave, dismissJob]);

  return <BackgroundJobsContext.Provider value={value}>{children}</BackgroundJobsContext.Provider>;
}

export function useBackgroundJobs() {
  const ctx = useContext(BackgroundJobsContext);
  if (!ctx) throw new Error("useBackgroundJobs must be used within a BackgroundJobsProvider");
  return ctx;
}

async function runProductSave(
  { storeId, productId, payload, imageSelection, existingImageIds }: QueueProductSaveArgs,
  onProgress: (patch: Partial<BackgroundJob>) => void
) {
  const basePath = `/owner/stores/${storeId}/products`;

  const orderedImages = [...imageSelection.images].sort((left, right) => {
    if (left.id === imageSelection.previewImageId) return -1;
    if (right.id === imageSelection.previewImageId) return 1;
    return 0;
  });
  const keptExistingIds = new Set(imageSelection.images.map((image) => image.existingId).filter(Boolean));
  const imagesToDelete = existingImageIds.filter((imageId) => !keptExistingIds.has(imageId));
  const imagesToUpload = orderedImages.filter((image) => image.file);

  const weightDelete = imagesToDelete.length ? WEIGHT_DELETE : 0;
  const weightUpload = imagesToUpload.length ? WEIGHT_UPLOAD : 0;
  const totalWeight = WEIGHT_SAVE + weightDelete + weightUpload + WEIGHT_ORDER;
  let doneWeight = 0;

  function setPercent(extra = 0) {
    onProgress({ percent: Math.max(1, Math.min(99, Math.round(((doneWeight + extra) / totalWeight) * 100))) });
  }

  onProgress({ message: "Сохраняем товар…" });
  setPercent();
  const { data } = productId
    ? await api.patch<Product>(`${basePath}/${productId}`, payload)
    : await api.post<Product>(basePath, payload);
  doneWeight += WEIGHT_SAVE;
  setPercent();

  for (const [index, imageId] of imagesToDelete.entries()) {
    onProgress({
      message: imagesToDelete.length > 1 ? `Удаляем старые фото… (${index + 1}/${imagesToDelete.length})` : "Удаляем старые фото…"
    });
    await api.delete(`${basePath}/${data.id}/images/${imageId}`);
    doneWeight += weightDelete / imagesToDelete.length;
    setPercent();
  }

  const uploadedIds = new Map<string, string>();
  const knownImageIds = new Set(existingImageIds.filter((imageId) => keptExistingIds.has(imageId)));

  for (const [index, image] of imagesToUpload.entries()) {
    onProgress({
      message: imagesToUpload.length > 1 ? `Загружаем фото ${index + 1} из ${imagesToUpload.length}…` : "Загружаем фото…"
    });
    const formData = new FormData();
    formData.append("image", image.file as File);
    const perImageWeight = weightUpload / imagesToUpload.length;
    const response = await api.post<Product>(`${basePath}/${data.id}/images`, formData, {
      onUploadProgress: (event) => {
        if (!event.total) return;
        setPercent(perImageWeight * (event.loaded / event.total));
      }
    });
    doneWeight += perImageWeight;
    const uploaded = response.data.images.find((item) => !knownImageIds.has(item.id));
    if (uploaded) {
      uploadedIds.set(image.id, uploaded.id);
      knownImageIds.add(uploaded.id);
    }
    setPercent();
  }

  const imageIds = orderedImages
    .map((image) => image.existingId ?? uploadedIds.get(image.id))
    .filter((imageId): imageId is string => Boolean(imageId));
  if (imageIds.length) {
    onProgress({ message: "Сохраняем порядок фото…" });
    await api.patch(`${basePath}/${data.id}/images/order`, { imageIds });
  }
  doneWeight += WEIGHT_ORDER;
  setPercent();
}
