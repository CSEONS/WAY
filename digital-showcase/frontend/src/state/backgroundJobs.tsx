import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { api } from "../api/client";
import type { ProductImageSelection, ProductPayload } from "../components/product-form";
import type { Product } from "../types/models";

/** waiting — queued behind another product of the same batch. */
export type BackgroundJobStatus = "waiting" | "running" | "done" | "error";

export interface BackgroundJob {
  id: string;
  title: string;
  storeId: string;
  /** Known once the product is created on the server: «Посмотреть товар» after saving. */
  productId?: string;
  status: BackgroundJobStatus;
  /** The product is saved and waits only for «Превью с ИИ» still drawing: it can be opened already. */
  waitsForPreview?: boolean;
  percent: number;
  message: string;
}

export interface QueueProductSaveArgs {
  storeId: string;
  productId?: string;
  payload: ProductPayload;
  imageSelection: ProductImageSelection;
  existingImageIds: string[];
}

/**
 * What a save has already done on the server. A retry continues from here:
 * the product isn't created twice and uploaded photos aren't sent again.
 */
interface SaveProgress {
  productId?: string;
  /** Form image id → id of the uploaded image on the server; the preview drawn after saving is under PREVIEW. */
  uploaded: Map<string, string>;
  deleted: Set<string>;
}

const PREVIEW = "ai-preview-after-save";

interface BackgroundJobsContextValue {
  jobs: BackgroundJob[];
  queueProductSave: (args: QueueProductSaveArgs) => string;
  /** Several products saved one after another (bulk adding), so a phone's connection isn't split ten ways. */
  queueProductBatch: (items: QueueProductSaveArgs[]) => string[];
  /** Runs a failed job again from where it stopped. */
  retryJob: (id: string) => void;
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
const WEIGHT_PREVIEW = 20;

export function BackgroundJobsProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<BackgroundJob[]>([]);
  const counterRef = useRef(0);
  // Kept outside React state: files and progress aren't for rendering.
  const runsRef = useRef(new Map<string, { args: QueueProductSaveArgs; progress: SaveProgress }>());

  const updateJob = useCallback((id: string, patch: Partial<BackgroundJob>) => {
    setJobs((current) => current.map((job) => (job.id === id ? { ...job, ...patch } : job)));
  }, []);

  const dismissJob = useCallback((id: string) => {
    runsRef.current.delete(id);
    setJobs((current) => current.filter((job) => job.id !== id));
  }, []);

  const addJob = useCallback((args: QueueProductSaveArgs, status: BackgroundJobStatus) => {
    const id = `job-${Date.now()}-${counterRef.current++}`;
    runsRef.current.set(id, { args, progress: { productId: args.productId, uploaded: new Map(), deleted: new Set() } });
    setJobs((current) => [
      ...current,
      { id, title: args.payload.title || "Новый товар", storeId: args.storeId, status, percent: 1, message: status === "waiting" ? "В очереди" : "Сохраняем товар…" }
    ]);
    return id;
  }, []);

  const run = useCallback(
    async (id: string) => {
      const entry = runsRef.current.get(id);
      if (!entry) return;
      updateJob(id, { status: "running", percent: 1, message: "Сохраняем товар…" });
      try {
        const note = await runProductSave(entry.args, entry.progress, (patch) => updateJob(id, patch));
        runsRef.current.delete(id);
        updateJob(id, { status: "done", waitsForPreview: false, percent: 100, message: note ?? "Товар сохранён" });
        window.setTimeout(() => dismissJob(id), 6000);
      } catch (err: any) {
        updateJob(id, { status: "error", message: err?.response?.data?.message ?? "Не удалось сохранить товар. Проверьте интернет." });
      }
    },
    [updateJob, dismissJob]
  );

  const queueProductSave = useCallback(
    (args: QueueProductSaveArgs) => {
      const id = addJob(args, "running");
      void run(id);
      return id;
    },
    [addJob, run]
  );

  const queueProductBatch = useCallback(
    (items: QueueProductSaveArgs[]) => {
      const ids = items.map((args) => addJob(args, "waiting"));
      void (async () => {
        // A failed product doesn't stop the rest; it stays in the dock with «Повторить».
        for (const id of ids) await run(id);
      })();
      return ids;
    },
    [addJob, run]
  );

  const retryJob = useCallback((id: string) => void run(id), [run]);

  const hasUnfinishedJobs = jobs.some((job) => job.status === "running" || job.status === "waiting");
  useEffect(() => {
    if (!hasUnfinishedJobs) return;
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
      // Older browsers need returnValue set to show the «Leave site?» dialog.
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnfinishedJobs]);

  const value = useMemo(
    () => ({ jobs, queueProductSave, queueProductBatch, retryJob, dismissJob }),
    [jobs, queueProductSave, queueProductBatch, retryJob, dismissJob]
  );

  return <BackgroundJobsContext.Provider value={value}>{children}</BackgroundJobsContext.Provider>;
}

export function useBackgroundJobs() {
  const ctx = useContext(BackgroundJobsContext);
  if (!ctx) throw new Error("useBackgroundJobs must be used within a BackgroundJobsProvider");
  return ctx;
}

/**
 * Grows each time a product of this store finishes saving: a cue for a list to
 * reload itself. One waiting for its preview counts twice — saved, then with the preview.
 */
export function useSavedProductCount(storeId: string | undefined) {
  const { jobs } = useBackgroundJobs();
  const seenRef = useRef(new Set<string>());
  const [count, setCount] = useState(0);

  useEffect(() => {
    const fresh = jobs
      .filter((job) => job.storeId === storeId && (job.status === "done" || job.waitsForPreview))
      .map((job) => `${job.id}:${job.status}`)
      .filter((key) => !seenRef.current.has(key));
    if (!fresh.length) return;
    fresh.forEach((key) => seenRef.current.add(key));
    setCount((current) => current + fresh.length);
  }, [jobs, storeId]);

  return count;
}

/** Saves the product; a note for the dock when not everything worked out (the preview couldn't be drawn). */
async function runProductSave(
  { storeId, payload, imageSelection, existingImageIds }: QueueProductSaveArgs,
  progress: SaveProgress,
  onProgress: (patch: Partial<BackgroundJob>) => void
): Promise<string | undefined> {
  const basePath = `/owner/stores/${storeId}/products`;

  const orderedImages = [...imageSelection.images].sort((left, right) => {
    if (left.id === imageSelection.previewImageId) return -1;
    if (right.id === imageSelection.previewImageId) return 1;
    return 0;
  });
  const keptExistingIds = new Set(imageSelection.images.map((image) => image.existingId).filter(Boolean));
  const imagesToDelete = existingImageIds.filter((imageId) => !keptExistingIds.has(imageId) && !progress.deleted.has(imageId));
  const imagesToUpload = orderedImages.filter((image) => image.file && !progress.uploaded.has(image.id));

  const weightDelete = imagesToDelete.length ? WEIGHT_DELETE : 0;
  const weightUpload = imagesToUpload.length ? WEIGHT_UPLOAD : 0;
  const { pendingPreview } = imageSelection;
  const totalWeight = WEIGHT_SAVE + weightDelete + weightUpload + WEIGHT_ORDER + (pendingPreview ? WEIGHT_PREVIEW : 0);
  let doneWeight = 0;

  function setPercent(extra = 0) {
    onProgress({ percent: Math.max(1, Math.min(99, Math.round(((doneWeight + extra) / totalWeight) * 100))) });
  }

  onProgress({ message: "Сохраняем товар…" });
  setPercent();
  // After a failed first attempt the product may already exist: update it instead of creating a twin.
  const { data } = progress.productId
    ? await api.patch<Product>(`${basePath}/${progress.productId}`, payload)
    : await api.post<Product>(basePath, payload);
  progress.productId = data.id;
  onProgress({ productId: data.id });
  doneWeight += WEIGHT_SAVE;
  setPercent();

  for (const [index, imageId] of imagesToDelete.entries()) {
    onProgress({
      message: imagesToDelete.length > 1 ? `Удаляем старые фото… (${index + 1}/${imagesToDelete.length})` : "Удаляем старые фото…"
    });
    await api.delete(`${basePath}/${data.id}/images/${imageId}`);
    progress.deleted.add(imageId);
    doneWeight += weightDelete / imagesToDelete.length;
    setPercent();
  }

  const knownImageIds = new Set([...existingImageIds.filter((imageId) => keptExistingIds.has(imageId)), ...progress.uploaded.values()]);

  /** Uploads one photo; its id on the server is remembered under `key`. */
  async function upload(key: string, file: File, livingBeings: string[] | undefined, weight: number) {
    const formData = new FormData();
    formData.append("image", file);
    // A cover from «Превью с ИИ» with people or animals on it: the server sends the product to moderation at once.
    if (livingBeings?.length) formData.append("livingBeings", JSON.stringify(livingBeings));
    const response = await api.post<Product>(`${basePath}/${data.id}/images`, formData, {
      onUploadProgress: (event) => {
        if (!event.total) return;
        setPercent(weight * (event.loaded / event.total));
      }
    });
    doneWeight += weight;
    const uploaded = response.data.images.find((item) => !knownImageIds.has(item.id));
    if (uploaded) {
      progress.uploaded.set(key, uploaded.id);
      knownImageIds.add(uploaded.id);
    }
    setPercent();
  }

  for (const [index, image] of imagesToUpload.entries()) {
    onProgress({
      message: imagesToUpload.length > 1 ? `Загружаем фото ${index + 1} из ${imagesToUpload.length}…` : "Загружаем фото…"
    });
    await upload(image.id, image.file as File, image.livingBeings, weightUpload / imagesToUpload.length);
  }

  const imageIds = orderedImages
    .map((image) => image.existingId ?? progress.uploaded.get(image.id))
    .filter((imageId): imageId is string => Boolean(imageId));
  if (imageIds.length) {
    onProgress({ message: "Сохраняем порядок фото…" });
    await api.patch(`${basePath}/${data.id}/images/order`, { imageIds });
  }
  doneWeight += WEIGHT_ORDER;
  setPercent();
  if (!pendingPreview) return undefined;

  // The owner saved before «Превью с ИИ» finished: the product is there already, the picture joins it as the cover.
  onProgress({ waitsForPreview: true, message: "Товар сохранён, дорисовываем превью…" });
  const picture = await pendingPreview.picture;
  if (!picture) return "Товар сохранён, но превью нарисовать не удалось";
  if (!progress.uploaded.has(PREVIEW)) {
    onProgress({ message: "Загружаем превью…" });
    await upload(PREVIEW, picture.file, picture.livingBeings, WEIGHT_PREVIEW);
  }
  const previewId = progress.uploaded.get(PREVIEW);
  if (!previewId) return undefined;
  // It takes the place of the preview drawn before it, as it would have in the form.
  const replacedId = pendingPreview.replaces ? progress.uploaded.get(pendingPreview.replaces) : undefined;
  if (replacedId && !progress.deleted.has(replacedId)) {
    await api.delete(`${basePath}/${data.id}/images/${replacedId}`);
    progress.deleted.add(replacedId);
  }
  await api.patch(`${basePath}/${data.id}/images/order`, { imageIds: [previewId, ...imageIds.filter((imageId) => imageId !== replacedId)] });
  return "Товар сохранён с превью";
}
