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
 * it takes. A finished picture waits here — a toast and the button say so.
 * Leaving the form drops it, like any unsaved change.
 */
export function usePreviewDrawing(path: string | null, isOpen: boolean) {
  const toast = useToast();
  const [results, setResults] = useState<PreviewResult[]>([]);
  const [selected, setSelected] = useState(0);
  const [isDrawing, setIsDrawing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [hasUnseen, setHasUnseen] = useState(false);
  const isOpenRef = useRef(isOpen);
  const resultsRef = useRef(results);
  const isMounted = useRef(true);
  // Every attempt costs money and an AI card: a double tap must not start two.
  const isDrawingRef = useRef(false);

  useEffect(() => {
    isOpenRef.current = isOpen;
    if (isOpen) setHasUnseen(false);
  }, [isOpen]);

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

  /** One picture from the photo and options in formData (see PreviewGenerator). */
  async function draw(formData: FormData) {
    if (!path || isDrawingRef.current) return;
    isDrawingRef.current = true;
    setError("");
    setIsDrawing(true);
    try {
      const { data } = await api.post<{ image: string; livingBeings: string[] }>(path, formData);
      if (!isMounted.current) return;
      const file = dataUrlToFile(data.image, `ai-preview-${Date.now()}`);
      setSelected(resultsRef.current.length);
      setResults((current) => [...current, { file, url: URL.createObjectURL(file), livingBeings: data.livingBeings ?? [] }]);
      if (!isOpenRef.current) {
        setHasUnseen(true);
        toast.show("Превью готово — откройте его кнопкой под фото товара", { tone: "success", duration: 6000 });
      }
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

  return { results, selected, setSelected, isDrawing, seconds, error, hasUnseen, draw };
}

export type PreviewDrawing = ReturnType<typeof usePreviewDrawing>;
