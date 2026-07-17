import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { Product, ProductStatus } from "../types/models";

interface VariantFormRow {
  id: string;
  colorName: string;
  colorHex: string;
  size: string;
  price: string;
}

interface ProductFormState {
  title: string;
  description: string;
  price: string;
  category: string;
  status: ProductStatus;
  isVisible: number;
}

interface SavedProductFormDraft {
  form: ProductFormState;
  priceMode: "number" | "ask";
  aiPrompt: string;
  variants: VariantFormRow[];
}

export interface ProductPayload {
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
}

type ProductDraft = ProductPayload;

export interface ProductFormImage {
  id: string;
  existingId: string | null;
  file: File | null;
  name: string;
  url: string;
}

export interface ProductImageSelection {
  images: ProductFormImage[];
  previewImageId: string | null;
}

const voiceQuestions = [
  "Что это за товар и как он называется?",
  "Какие цвета доступны?",
  "Какие размеры есть у каждого цвета?",
  "Сколько стоит товар или отдельные комбинации?",
  "К какой категории его отнести?"
];

function createEmptyVariant(): VariantFormRow {
  return { id: crypto.randomUUID(), colorName: "", colorHex: "#2779a7", size: "", price: "" };
}

function initialVariants(initial?: Product): VariantFormRow[] {
  if (initial?.variants.length) {
    return initial.variants.map((variant) => ({
      id: variant.id,
      colorName: variant.colorName,
      colorHex: variant.colorHex ?? "#2779a7",
      size: variant.size,
      price: variant.price?.toString() ?? ""
    }));
  }

  if (initial?.sizes.length || initial?.colors.length) {
    const sizes = initial.sizes.length ? initial.sizes : [{ id: "default-size", value: "" }];
    const colors = initial.colors.length ? initial.colors : [{ id: "default-color", name: "", hex: null }];
    return colors.flatMap((color) =>
      sizes.map((size) => ({
        id: crypto.randomUUID(),
        colorName: color.name,
        colorHex: color.hex ?? "#2779a7",
        size: size.value,
        price: initial.price?.toString() ?? ""
      }))
    );
  }

  return [createEmptyVariant()];
}

function initialImages(initial?: Product): ProductFormImage[] {
  return (
    initial?.images.map((image) => ({
      id: image.id,
      existingId: image.id,
      file: null,
      name: "Картинка товара",
      url: image.url
    })) ?? []
  );
}

function readSavedDraft(draftKey?: string): SavedProductFormDraft | null {
  if (!draftKey) return null;
  try {
    const value = localStorage.getItem(draftKey);
    return value ? (JSON.parse(value) as SavedProductFormDraft) : null;
  } catch {
    return null;
  }
}

function hasDraftContent(draft: SavedProductFormDraft) {
  return (
    draft.form.title.trim() ||
    draft.form.description.trim() ||
    draft.form.price.trim() ||
    draft.form.category.trim() ||
    draft.aiPrompt.trim() ||
    draft.variants.some((variant) => variant.colorName.trim() || variant.size.trim() || variant.price.trim())
  );
}

export function ProductForm({
  initial,
  aiDraftPath,
  aiFormEnabled,
  draftKey,
  onSubmit
}: {
  initial?: Product;
  aiDraftPath?: string;
  aiFormEnabled: boolean;
  draftKey?: string;
  onSubmit: (payload: ProductPayload, imageSelection: ProductImageSelection) => Promise<void>;
}) {
  const savedDraft = useMemo(() => readSavedDraft(draftKey), [draftKey]);
  const initialPriceMode = initial?.priceText === "Уточнить у продавца" ? "ask" : "number";
  const [form, setForm] = useState<ProductFormState>(
    savedDraft?.form ?? {
      title: initial?.title ?? "",
      description: initial?.description ?? "",
      price: initial?.price?.toString() ?? "",
      category: initial?.category ?? "",
      status: initial?.status ?? "AVAILABLE",
      isVisible: initial?.isVisible ?? 1
    }
  );
  const [priceMode, setPriceMode] = useState<"number" | "ask">(savedDraft?.priceMode ?? initialPriceMode);
  const [aiMode, setAiMode] = useState(false);
  const [aiPrompt, setAiPrompt] = useState(savedDraft?.aiPrompt ?? "");
  const [aiError, setAiError] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceRecorder, setVoiceRecorder] = useState<MediaRecorder | null>(null);
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voiceDurationSeconds, setVoiceDurationSeconds] = useState(0);
  const [aiInputMode, setAiInputMode] = useState<"text" | "voice">("text");
  const [aiDraftApplied, setAiDraftApplied] = useState(false);
  const [aiSuccessVisible, setAiSuccessVisible] = useState(false);
  const [variants, setVariants] = useState<VariantFormRow[]>(() => savedDraft?.variants?.length ? savedDraft.variants : initialVariants(initial));
  const [images, setImages] = useState<ProductFormImage[]>(() => initialImages(initial));
  const [previewImageId, setPreviewImageId] = useState<string | null>(() => initial?.images[0]?.id ?? null);
  const [isDraftNoticeVisible, setIsDraftNoticeVisible] = useState(Boolean(savedDraft));
  const previewImage = images.find((image) => image.id === previewImageId) ?? images[0];

  useEffect(() => {
    if (!recordingStartedAt) return;
    const timer = window.setInterval(() => setRecordingSeconds(Math.floor((Date.now() - recordingStartedAt) / 1000)), 250);
    return () => window.clearInterval(timer);
  }, [recordingStartedAt]);

  useEffect(() => {
    if (!draftKey) return;
    const draft: SavedProductFormDraft = { form, priceMode, aiPrompt, variants };
    if (!hasDraftContent(draft)) {
      localStorage.removeItem(draftKey);
      return;
    }
    localStorage.setItem(draftKey, JSON.stringify(draft));
  }, [aiPrompt, draftKey, form, priceMode, variants]);

  useEffect(() => {
    if (!aiSuccessVisible) return;
    const timer = window.setTimeout(() => setAiSuccessVisible(false), 3500);
    return () => window.clearTimeout(timer);
  }, [aiSuccessVisible]);

  function clearSavedDraft() {
    if (draftKey) localStorage.removeItem(draftKey);
    setIsDraftNoticeVisible(false);
  }

  function updateVariant(id: string, patch: Partial<VariantFormRow>) {
    setVariants((current) => current.map((variant) => (variant.id === id ? { ...variant, ...patch } : variant)));
  }

  function removeVariant(id: string) {
    setVariants((current) => (current.length > 1 ? current.filter((variant) => variant.id !== id) : [createEmptyVariant()]));
  }

  function addImages(files: FileList | null) {
    if (!files?.length) return;
    const nextImages = [...files].map((file) => ({ id: crypto.randomUUID(), existingId: null, file, name: file.name, url: URL.createObjectURL(file) }));
    setImages((current) => [...current, ...nextImages]);
    setPreviewImageId((current) => current ?? nextImages[0]?.id ?? null);
  }

  function removeImage(id: string) {
    setImages((current) => {
      const image = current.find((item) => item.id === id);
      if (image?.file) URL.revokeObjectURL(image.url);
      const nextImages = current.filter((item) => item.id !== id);
      setPreviewImageId((currentPreview) => (currentPreview === id ? nextImages[0]?.id ?? null : currentPreview));
      return nextImages;
    });
  }

  function applyDraft(draft: ProductDraft) {
    setForm((current) => ({
      ...current,
      title: draft.title ?? current.title,
      description: draft.description ?? current.description,
      price: draft.price?.toString() ?? current.price,
      category: draft.category ?? current.category,
      status: draft.status ?? current.status,
      isVisible: draft.isVisible ?? current.isVisible
    }));
    setPriceMode(draft.priceText === "Уточнить у продавца" || draft.price == null ? "ask" : "number");
    if (draft.variants?.length) {
      setVariants(
        draft.variants.map((variant) => ({
          id: crypto.randomUUID(),
          colorName: variant.colorName,
          colorHex: variant.colorHex ?? "#2779a7",
          size: variant.size,
          price: variant.price?.toString() ?? ""
        }))
      );
    }
  }

  async function fillWithAi() {
    setAiError("");
    setAiLoading(true);
    try {
      const formData = new FormData();
      if (aiPrompt.trim()) formData.append("prompt", aiPrompt.trim());
      for (const image of images) {
        if (image.file) formData.append("images", image.file);
        else if (image.url) formData.append("imageUrls", image.url);
      }
      if (aiInputMode === "voice") {
        if (!voiceBlob) throw new Error("Сначала запишите голосовое сообщение");
        formData.append("voice", voiceBlob, "product-voice.webm");
      }

      const { data } = await api.post<ProductDraft>(aiDraftPath ?? "/owner/products/ai-draft", formData);
      applyDraft(data);
      setAiDraftApplied(true);
      setAiSuccessVisible(true);
    } catch (err: any) {
      setAiError(err.response?.data?.message ?? err.message ?? "Не удалось заполнить форму");
    } finally {
      setAiLoading(false);
    }
  }

  async function recordVoice() {
    if (voiceRecorder && voiceRecorder.state === "recording") {
      voiceRecorder.stop();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setAiError("Браузер не поддерживает запись аудио");
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
        setAiError("Не удалось записать голос");
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
      setAiError("Не удалось получить доступ к микрофону");
    }
  }

  function selectFieldText(event: KeyboardEvent<HTMLFormElement>) {
    if (!(event.ctrlKey || event.metaKey) || (event.key.toLowerCase() !== "a" && event.code !== "KeyA")) return;
    if (!(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) return;
    if (event.target.disabled || event.target.readOnly) return;
    if (event.target instanceof HTMLInputElement && ["button", "checkbox", "color", "file", "radio", "range", "submit"].includes(event.target.type)) return;

    event.preventDefault();
    event.target.select();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const normalizedVariants = variants
      .map((variant) => ({
        colorName: variant.colorName.trim(),
        colorHex: variant.colorHex.trim() || null,
        size: variant.size.trim(),
        price: variant.price ? Number(variant.price) : null
      }))
      .filter((variant) => variant.colorName && variant.size);
    const sizes = [...new Set(normalizedVariants.map((variant) => variant.size))];
    const colorsByName = new Map<string, { name: string; hex: string | null }>();
    for (const variant of normalizedVariants) {
      if (!colorsByName.has(variant.colorName)) colorsByName.set(variant.colorName, { name: variant.colorName, hex: variant.colorHex });
    }

    await onSubmit(
      {
        title: form.title,
        description: form.description || null,
        price: priceMode === "number" && form.price ? Number(form.price) : null,
        priceText: priceMode === "ask" ? "Уточнить у продавца" : null,
        category: form.category || null,
        status: form.status as ProductStatus,
        isVisible: Number(form.isVisible),
        sizes,
        colors: [...colorsByName.values()],
        variants: normalizedVariants
      },
      { images, previewImageId }
    );
    clearSavedDraft();
  }

  return (
    <form className="form" onSubmit={submit} onKeyDownCapture={selectFieldText}>
      {isDraftNoticeVisible && (
        <div className="autosave-note">
          <span>Восстановлен локальный черновик</span>
          <button type="button" onClick={clearSavedDraft}>
            Очистить
          </button>
        </div>
      )}
      <div className="mode-switch">
        <span>Обычный ввод</span>
        <button
          className={aiMode ? "switch active" : "switch"}
          type="button"
          disabled={!aiFormEnabled}
          aria-pressed={aiMode}
          onClick={() => {
            setAiMode(!aiMode);
            setAiDraftApplied(false);
          }}
        >
          <span />
        </button>
        <span>ИИ ввод {!aiFormEnabled && <LockIcon />}</span>
      </div>
      {!aiFormEnabled && (
        <div className="ai-unavailable-note">
          <strong>AI недоступен</strong>
          <span>Администратор еще не подключил AI-заполнение для этого магазина.</span>
        </div>
      )}
      {aiMode && aiDraftApplied && (
        <div className="ai-result-summary">
          <span>ИИ заполнил форму — проверьте результат ниже.</span>
          <button type="button" onClick={() => setAiDraftApplied(false)}>Изменить запрос</button>
        </div>
      )}
      {aiMode && !aiDraftApplied && (
        <div className={aiLoading ? "ai-draft-box loading" : "ai-draft-box"} aria-busy={aiLoading}>
          <div className="segmented">
            <button className={aiInputMode === "text" ? "active" : ""} type="button" onClick={() => setAiInputMode("text")}>Текст</button>
            <button className={aiInputMode === "voice" ? "active" : ""} type="button" onClick={() => setAiInputMode("voice")}>Голос</button>
          </div>
          {aiInputMode === "text" && (
            <label>
              Описание товара для ИИ
              <textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder="Например: синее платье, размеры S и M, цена 4500 рублей, есть еще белый цвет..." />
            </label>
          )}
          {aiInputMode === "voice" && (
            <div className="voice-panel">
              <div className={isListening ? "recording-status active" : "recording-status"}>
                <MicrophoneIcon />
                {isListening ? `Идет запись... ${formatDuration(recordingSeconds)}` : voiceBlob ? `Голосовое сообщение записано: ${formatDuration(voiceDurationSeconds)}` : "Запись не запущена"}
                {isListening && (
                  <span className="recording-visual" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                )}
              </div>
              <ol>
                {voiceQuestions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ol>
            </div>
          )}
          {aiError && <p className="error">{aiError}</p>}
          <div className="section-head">
            {aiInputMode === "voice" && (
              <button type="button" onClick={recordVoice}>
                <MicrophoneIcon />
                {isListening ? "Остановить запись" : voiceBlob ? "Перезаписать" : "Надиктовать"}
              </button>
            )}
            <button className="primary" type="button" disabled={(aiInputMode === "text" ? !aiPrompt.trim() : !voiceBlob || isListening) || aiLoading} onClick={fillWithAi}>
              {aiLoading && <span className="spinner" aria-hidden="true" />}
              {aiLoading ? "ИИ обрабатывает данные..." : "Заполнить форму"}
            </button>
          </div>
        </div>
      )}
      <div className="image-uploader">
        <div className="section-head">
          <h2>Картинки товара</h2>
          <div className="image-tools">
            <label className="button-link">
              Добавить картинки
              <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(e) => addImages(e.target.files)} />
            </label>
          </div>
        </div>
        {images.length ? (
          <div className="image-gallery-picker">
            <div className="image-preview-main">
              <img src={previewImage.url} alt={previewImage.name} />
            </div>
            <div className="image-thumb-strip">
              {images.map((image) => (
                <div className={previewImageId === image.id ? "image-thumb active" : "image-thumb"} key={image.id}>
                  <button type="button" onClick={() => setPreviewImageId(image.id)} aria-label={`Выбрать ${image.name} как превью`}>
                    <img src={image.url} alt={image.name} />
                  </button>
                  <button className="image-remove" type="button" onClick={() => removeImage(image.id)} aria-label={`Удалить ${image.name}`}>
                    x
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="empty-upload">Картинки еще не выбраны</div>
        )}
      </div>
      {(!aiMode || aiDraftApplied) && (
        <>
          <label>Название<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label>
          <label>Описание<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <div className="price-mode">
            <div className="segmented">
              <button className={priceMode === "number" ? "active" : ""} type="button" onClick={() => setPriceMode("number")}>Цена</button>
              <button className={priceMode === "ask" ? "active" : ""} type="button" onClick={() => setPriceMode("ask")}>Уточнить у продавца</button>
            </div>
            {priceMode === "number" ? (
              <label>Цена<input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></label>
            ) : (
              <label>Цена<input value="Уточнить у продавца" disabled /></label>
            )}
          </div>
          <label>Категория<input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></label>
          <div className="publish-controls">
            <label>
              Наличие
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ProductStatus })}>
                <option value="AVAILABLE">В наличии</option>
                <option value="CHECK_IN_STORE">Уточнить в магазине</option>
                <option value="NOT_AVAILABLE">Нет в наличии</option>
              </select>
            </label>
            <label className="inline-check">
              <input
                type="checkbox"
                checked={Boolean(form.isVisible)}
                onChange={(e) => setForm({ ...form, isVisible: e.target.checked ? 1 : 0 })}
              />
              Показывать в витрине
            </label>
          </div>
          <div className="variant-editor">
            <div className="section-head">
              <h2>Комбинации товара</h2>
            </div>
            <div className="variant-list">
              <div className="variant-header" aria-hidden="true">
                <span>Цвет</span>
                <span>HEX</span>
                <span>Размер</span>
                <span>Цена</span>
                <span />
              </div>
              {variants.map((variant) => (
                <div className="variant-row" key={variant.id}>
                  <input aria-label="Цвет" value={variant.colorName} onChange={(e) => updateVariant(variant.id, { colorName: e.target.value })} placeholder="Синий" />
                  <input
                    aria-label="HEX"
                    className="color-picker"
                    type="color"
                    value={variant.colorHex || "#2779a7"}
                    onChange={(e) => updateVariant(variant.id, { colorHex: e.target.value })}
                  />
                  <input aria-label="Размер" value={variant.size} onChange={(e) => updateVariant(variant.id, { size: e.target.value })} placeholder="M" />
                  <input aria-label="Цена" type="number" value={variant.price} onChange={(e) => updateVariant(variant.id, { price: e.target.value })} placeholder={form.price || "0"} />
                  <button type="button" onClick={() => removeVariant(variant.id)}>
                    Удалить
                  </button>
                </div>
              ))}
            </div>
            <div className="variant-actions">
              <button type="button" onClick={() => setVariants([...variants, createEmptyVariant()])}>
                Добавить комбинацию
              </button>
            </div>
          </div>
          <button className="primary">Сохранить</button>
        </>
      )}
      {aiSuccessVisible && <div className="toast success" role="status">ИИ закончил обработку. Проверьте заполненные поля.</div>}
    </form>
  );
}

function LockIcon() {
  return (
    <svg className="inline-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 10V8a5 5 0 0 1 10 0v2h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h1Zm2 0h6V8a3 3 0 0 0-6 0v2Z" />
    </svg>
  );
}

function MicrophoneIcon() {
  return (
    <svg className="inline-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm5-3a1 1 0 1 1 2 0 7 7 0 0 1-6 6.92V21a1 1 0 1 1-2 0v-3.08A7 7 0 0 1 5 11a1 1 0 1 1 2 0 5 5 0 0 0 10 0Z" />
    </svg>
  );
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
