import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import { useToast } from "../../ui";
import { dataUrlToFile } from "./previewOptions";

export interface PreviewResult {
  file: File;
  url: string;
  /** People or animals the model drew anyway: with this cover the product goes to moderation when saved. */
  livingBeings: string[];
}

/**
 * «Превью с ИИ» is drawn here, in the product form, not in its window: the
 * owner can close the window and keep filling in the product for the minute
 * it takes. A finished picture goes straight to the photos as the cover
 * (`addCover`); a newer one, or another variant, takes its place there.
 * Leaving the form drops it, like any unsaved change.
 */
export function usePreviewDrawing(
  path: string | null,
  isOpen: boolean,
  addCover: (file: File, livingBeings: string[], replaceId: string | null) => string
) {
  const toast = useToast();
  const [results, setResults] = useState<PreviewResult[]>([]);
  const [selected, setSelected] = useState(0);
  /** The photo the selected picture became; null until the first one is ready. */
  const [coverImageId, setCoverImageId] = useState<string | null>(null);
  /** The product photo drawn from last: the next attempt starts from it, not from the drawn cover. */
  const [sourcePhotoId, setSourcePhotoId] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const isOpenRef = useRef(isOpen);
  const resultsRef = useRef(results);
  const coverImageIdRef = useRef(coverImageId);
  const addCoverRef = useRef(addCover);
  const isMounted = useRef(true);
  // Every attempt costs money and an AI card: a double tap must not start two.
  const isDrawingRef = useRef(false);

  useEffect(() => {
    isOpenRef.current = isOpen;
    addCoverRef.current = addCover;
  });

  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      resultsRef.current.forEach((result) => URL.revokeObjectURL(result.url));
    };
  }, []);

  // Drawing takes a while: a running count shows it's alive.
  useEffect(() => {
    if (!isDrawing) return;
    const startedAt = Date.now();
    setSeconds(0);
    const timer = window.setInterval(() => setSeconds(Math.round((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [isDrawing]);

  /** Makes a drawn picture the cover, in place of the one made the cover before. */
  function chooseResult(result: PreviewResult, index: number) {
    coverImageIdRef.current = addCoverRef.current(result.file, result.livingBeings, coverImageIdRef.current);
    setCoverImageId(coverImageIdRef.current);
    setSelected(index);
  }

  /** One picture from the photo and options in formData (see PreviewGenerator); ready, it becomes the cover. */
  async function draw(formData: FormData, photoId: string) {
    if (!path || isDrawingRef.current) return;
    isDrawingRef.current = true;
    setSourcePhotoId(photoId);
    setError("");
    setIsDrawing(true);
    try {
      const { data } = await api.post<{ image: string; livingBeings: string[] }>(path, formData);
      if (!isMounted.current) return;
      const file = dataUrlToFile(data.image, `ai-preview-${Date.now()}`);
      const result = { file, url: URL.createObjectURL(file), livingBeings: data.livingBeings ?? [] };
      chooseResult(result, resultsRef.current.length);
      resultsRef.current = [...resultsRef.current, result];
      setResults(resultsRef.current);
    } catch (err: any) {
      if (!isMounted.current) return;
      const message = err.response?.data?.message ?? "Не удалось нарисовать превью. Проверьте интернет и попробуйте ещё раз.";
      setError(message);
      if (!isOpenRef.current) toast.show(message, { tone: "danger", duration: 6000 });
    } finally {
      isDrawingRef.current = false;
      if (isMounted.current) setIsDrawing(false);
    }
  }

  return { results, selected, coverImageId, sourcePhotoId, isDrawing, seconds, error, draw, chooseResult };
}

export type PreviewDrawing = ReturnType<typeof usePreviewDrawing>;
