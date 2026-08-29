import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, CloudUploadIcon, Mic01Icon, TextFontIcon } from "@hugeicons/core-free-icons";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { Product, ProductStatus } from "../types/models";

const bulkQuestions = [
  "Сколько товаров на фотографиях и какие фото к какому товару относятся?",
  "Как называется каждый товар?",
  "Какие цвета и размеры есть у каждого товара?",
  "Сколько стоит каждый товар или отдельные комбинации?",
  "К какой категории отнести каждый товар?"
];

interface BulkDraft {
  title: string;
  description: string | null;
  price: number | null;
  priceText: string | null;
  category: string | null;
  status: ProductStatus;
  isVisible: number;
  sizes: string[];
  colors: { name: string; hex: string | null }[];
  variants: { colorName: string; colorHex: string | null; size: string; price: number | null }[];
  imageIndexes: number[];
}

export function BulkProductCreator({ storeId, onClose, onComplete }: { storeId: string; onClose: () => void; onComplete: () => void }) {
  const [images, setImages] = useState<File[]>([]);
  const [inputMode, setInputMode] = useState<"text" | "voice">("text");
  const [prompt, setPrompt] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [voiceRecorder, setVoiceRecorder] = useState<MediaRecorder | null>(null);
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voiceDurationSeconds, setVoiceDurationSeconds] = useState(0);
  const [drafts, setDrafts] = useState<BulkDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const previews = useMemo(() => images.map((file) => URL.createObjectURL(file)), [images]);

  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  useEffect(() => {
    if (!recordingStartedAt) return;
    const timer = window.setInterval(() => setRecordingSeconds(Math.floor((Date.now() - recordingStartedAt) / 1000)), 250);
    return () => window.clearInterval(timer);
  }, [recordingStartedAt]);

  async function recordVoice() {
    if (voiceRecorder && voiceRecorder.state === "recording") {
      voiceRecorder.stop();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Браузер не поддерживает запись аудио");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      const startedAt = Date.now();
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = () => {
        setVoiceBlob(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
        setVoiceDurationSeconds(Math.max(1, Math.round((Date.now() - startedAt) / 1000)));
        setRecordingStartedAt(null);
        stream.getTracks().forEach((track) => track.stop());
        setIsListening(false);
        setVoiceRecorder(null);
      };
      recorder.onerror = () => {
        stream.getTracks().forEach((track) => track.stop());
        setIsListening(false);
        setVoiceRecorder(null);
        setRecordingStartedAt(null);
        setError("Не удалось записать голос");
      };
      setVoiceBlob(null);
      setVoiceDurationSeconds(0);
      setRecordingSeconds(0);
      setRecordingStartedAt(startedAt);
      setVoiceRecorder(recorder);
      setIsListening(true);
      recorder.start();
    } catch {
      setIsListening(false);
      setRecordingStartedAt(null);
      setError("Не удалось получить доступ к микрофону");
    }
  }

  async function groupImages() {
    setError("");
    setLoading(true);
    try {
      const formData = new FormData();
      images.forEach((image) => formData.append("images", image));
      if (inputMode === "text" && prompt.trim()) formData.append("prompt", prompt.trim());
      if (inputMode === "voice" && voiceBlob) formData.append("voice", voiceBlob, "bulk-products-voice.webm");
      const { data } = await api.post<BulkDraft[]>(`/owner/stores/${storeId}/products/bulk-ai-draft`, formData);
      setDrafts(data);
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Не удалось сгруппировать товары");
    } finally {
      setLoading(false);
    }
  }

  function updateDraft(index: number, patch: Partial<BulkDraft>) {
    setDrafts((current) => current.map((draft, draftIndex) => (draftIndex === index ? { ...draft, ...patch } : draft)));
  }

  async function createProducts() {
    setError("");
    setSaving(true);
    try {
      for (const [index, draft] of drafts.entries()) {
        setProgress(`Создаю товар ${index + 1} из ${drafts.length}`);
        const colors = draft.colors.filter((color) => color.name.trim());
        const sizes = draft.sizes.filter(Boolean);
        const variants = colors.flatMap((color) => sizes.map((size) => ({ colorName: color.name, colorHex: color.hex, size, price: draft.price })));
        const { data: product } = await api.post<Product>(`/owner/stores/${storeId}/products`, { ...draft, colors, sizes, variants });
        for (const imageIndex of draft.imageIndexes) {
          const image = images[imageIndex];
          if (!image) continue;
          const formData = new FormData();
          formData.append("image", image);
          await api.post(`/owner/stores/${storeId}/products/${product.id}/images`, formData);
        }
      }
      onComplete();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Не удалось сохранить все товары. Уже созданные товары сохранены.");
    } finally {
      setSaving(false);
      setProgress("");
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onPointerDown={(event) => event.currentTarget === event.target && onClose()}>
      <div className="modal bulk-product-modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <div className="modal-title">
            <h2>Массовое добавление товаров</h2>
            <p>ИИ сгруппирует фотографии. Перед созданием проверьте предложения.</p>
          </div>
          <button type="button" className="btn-icon btn-ghost" aria-label="Закрыть" onClick={onClose} disabled={loading || saving}>
            <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={1.8} />
          </button>
        </div>

        {!drafts.length ? (
          <div className="modal-body bulk-step">
            <label>
              <HugeiconsIcon icon={CloudUploadIcon} size={16} strokeWidth={1.8} />
              {" "}Фотографии товаров (от 2 до 40)
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setImages([...event.target.files ?? []].slice(0, 40))} />
            </label>
            {previews.length > 0 && <div className="bulk-preview-grid">{previews.map((url, index) => <img src={url} alt={`Изображение ${index + 1}`} key={url} />)}</div>}
            <div className="segmented segmented-sm">
              <button type="button" className={inputMode === "text" ? "is-active" : ""} onClick={() => setInputMode("text")}>
                <HugeiconsIcon icon={TextFontIcon} size={14} strokeWidth={1.8} />
                Текст
              </button>
              <button type="button" className={inputMode === "voice" ? "is-active" : ""} onClick={() => setInputMode("voice")}>
                <HugeiconsIcon icon={Mic01Icon} size={14} strokeWidth={1.8} />
                Голос
              </button>
            </div>
            <ol className="voice-questions">
              {bulkQuestions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ol>
            {inputMode === "text" && (
              <label>
                Текстовое описание
                <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Например: джинсы по 1000, носки по 50, размеры кепки 44..." />
              </label>
            )}
            {inputMode === "voice" && (
              <div className="voice-recorder">
                <div className={`voice-recorder-status${isListening ? " is-recording" : ""}`}>
                  <HugeiconsIcon icon={Mic01Icon} size={16} strokeWidth={1.8} />
                  {isListening
                    ? `Идет запись... ${formatDuration(recordingSeconds)}`
                    : voiceBlob
                      ? `Голосовое сообщение записано: ${formatDuration(voiceDurationSeconds)}`
                      : "Запись не запущена"}
                  {isListening && (
                    <span className="recording-dots" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </span>
                  )}
                </div>
                <button type="button" className="btn btn-secondary" onClick={recordVoice}>
                  <HugeiconsIcon icon={Mic01Icon} size={16} strokeWidth={1.8} />
                  {isListening ? "Остановить запись" : voiceBlob ? "Перезаписать" : "Надиктовать"}
                </button>
              </div>
            )}
            {error && <p className="auth-error">{error}</p>}
            <button type="button" className="btn btn-primary btn-lg" disabled={images.length < 2 || loading} onClick={groupImages}>
              {loading ? "ИИ группирует изображения..." : "Сгруппировать"}
            </button>
          </div>
        ) : (
          <div className="bulk-result-step">
            {drafts.map((draft, index) => (
              <article className="bulk-draft-card" key={index}>
                <div className="bulk-draft-images">{draft.imageIndexes.map((imageIndex) => previews[imageIndex] && <img src={previews[imageIndex]} alt="" key={imageIndex} />)}</div>
                <div className="bulk-draft-body">
                  <label>Название<input value={draft.title} onChange={(event) => updateDraft(index, { title: event.target.value })} required /></label>
                  <label>Описание<textarea value={draft.description ?? ""} onChange={(event) => updateDraft(index, { description: event.target.value || null })} /></label>
                  <label>Категория<input value={draft.category ?? ""} onChange={(event) => updateDraft(index, { category: event.target.value || null })} /></label>
                  <label>Цена<input type="number" value={draft.price ?? ""} placeholder="Уточнить у продавца" onChange={(event) => updateDraft(index, { price: event.target.value ? Number(event.target.value) : null, priceText: event.target.value ? null : "Уточнить у продавца", status: event.target.value ? draft.status : "CHECK_IN_STORE" })} /></label>
                  <label>Цвета<input value={draft.colors.map((color) => color.name).join(", ")} onChange={(event) => updateDraft(index, { colors: event.target.value.split(",").map((name) => ({ name: name.trim(), hex: null })).filter((color) => color.name) })} /></label>
                  <label>Размеры<input value={draft.sizes.join(", ")} placeholder="Уточнить у продавца" onChange={(event) => updateDraft(index, { sizes: event.target.value.split(",").map((size) => size.trim()).filter(Boolean) })} /></label>
                  <label>Наличие<select value={draft.status} onChange={(event) => updateDraft(index, { status: event.target.value as ProductStatus })}><option value="AVAILABLE">В наличии</option><option value="CHECK_IN_STORE">Уточнить у продавца</option><option value="NOT_AVAILABLE">Нет в наличии</option></select></label>
                </div>
              </article>
            ))}
            {error && <p className="auth-error">{error}</p>}
            {progress && <p role="status">{progress}</p>}
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setDrafts([])} disabled={saving}>Назад</button>
              <button type="button" className="btn btn-primary" onClick={createProducts} disabled={saving || drafts.some((draft) => !draft.title.trim())}>
                {saving ? "Создаю товары..." : `Создать товары (${drafts.length})`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
