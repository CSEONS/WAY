import { HugeiconsIcon } from "@hugeicons/react";
import {
  AiMagicIcon,
  Alert02Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Delete02Icon,
  Edit02Icon,
  ImageAdd01Icon,
  InformationCircleIcon,
  LockKeyIcon,
  Mic01Icon,
  TextFontIcon
} from "@hugeicons/core-free-icons";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { Select } from "./Select";
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

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createEmptyVariant(): VariantFormRow {
  return { id: createId(), colorName: "", colorHex: "#2779a7", size: "", price: "" };
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
        id: createId(),
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
  const [aiMode, setAiMode] = useState(() => aiFormEnabled && !initial);
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
    const nextImages = [...files].map((file) => ({ id: createId(), existingId: null, file, name: file.name, url: URL.createObjectURL(file) }));
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
          id: createId(),
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
    <form className="app-form product-form" onSubmit={submit} onKeyDownCapture={selectFieldText}>
      {isDraftNoticeVisible && (
        <div className="draft-banner">
          <span>
            <HugeiconsIcon icon={InformationCircleIcon} size={16} strokeWidth={1.8} /> Восстановлен локальный черновик
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={clearSavedDraft}>
            Очистить
          </button>
        </div>
      )}

      {aiFormEnabled ? (
        <div className="segmented">
          <button
            type="button"
            className={!aiMode ? "is-active" : ""}
            aria-pressed={!aiMode}
            onClick={() => setAiMode(false)}
          >
            <HugeiconsIcon icon={Edit02Icon} size={16} strokeWidth={1.8} />
            Обычный ввод
          </button>
          <button
            type="button"
            className={aiMode ? "is-active" : ""}
            aria-pressed={aiMode}
            onClick={() => {
              setAiMode(true);
              setAiDraftApplied(false);
            }}
          >
            <HugeiconsIcon icon={AiMagicIcon} size={16} strokeWidth={1.8} />
            ИИ ввод
          </button>
        </div>
      ) : (
        <div className="notice-banner">
          <HugeiconsIcon icon={LockKeyIcon} size={18} strokeWidth={1.8} />
          <div>
            <strong>AI недоступен</strong>
            <span>Администратор еще не подключил AI-заполнение для этого магазина.</span>
          </div>
        </div>
      )}

      {aiMode && aiDraftApplied && (
        <div className="notice-banner notice-success">
          <HugeiconsIcon icon={CheckmarkCircle02Icon} size={18} strokeWidth={1.8} />
          <span>ИИ заполнил форму — проверьте результат ниже.</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAiDraftApplied(false)}>
            Изменить запрос
          </button>
        </div>
      )}

      {aiMode && !aiDraftApplied && (
        <div className="ai-panel" aria-busy={aiLoading}>
          <div className="segmented segmented-sm">
            <button type="button" className={aiInputMode === "text" ? "is-active" : ""} onClick={() => setAiInputMode("text")}>
              <HugeiconsIcon icon={TextFontIcon} size={14} strokeWidth={1.8} />
              Текст
            </button>
            <button type="button" className={aiInputMode === "voice" ? "is-active" : ""} onClick={() => setAiInputMode("voice")}>
              <HugeiconsIcon icon={Mic01Icon} size={14} strokeWidth={1.8} />
              Голос
            </button>
          </div>
          {aiInputMode === "text" && (
            <label>
              Описание товара для ИИ
              <textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder="Например: синее платье, размеры S и M, цена 4500 рублей, есть еще белый цвет..." />
            </label>
          )}
          {aiInputMode === "voice" && (
            <div className="voice-recorder">
              <div className={`voice-recorder-status${isListening ? " is-recording" : ""}`}>
                <HugeiconsIcon icon={Mic01Icon} size={16} strokeWidth={1.8} />
                {isListening ? `Идет запись... ${formatDuration(recordingSeconds)}` : voiceBlob ? `Голосовое сообщение записано: ${formatDuration(voiceDurationSeconds)}` : "Запись не запущена"}
                {isListening && (
                  <span className="recording-dots" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                )}
              </div>
              <ol className="voice-questions">
                {voiceQuestions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ol>
            </div>
          )}
          {aiError && (
            <p className="auth-error">
              <HugeiconsIcon icon={Alert02Icon} size={16} strokeWidth={1.8} />
              {aiError}
            </p>
          )}
          <div className="ai-panel-actions">
            {aiInputMode === "voice" && (
              <button type="button" className="btn btn-secondary" onClick={recordVoice}>
                <HugeiconsIcon icon={Mic01Icon} size={16} strokeWidth={1.8} />
                {isListening ? "Остановить запись" : voiceBlob ? "Перезаписать" : "Надиктовать"}
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              disabled={(aiInputMode === "text" ? !aiPrompt.trim() : !voiceBlob || isListening) || aiLoading}
              onClick={fillWithAi}
            >
              <HugeiconsIcon icon={AiMagicIcon} size={16} strokeWidth={1.8} />
              {aiLoading ? "ИИ обрабатывает данные..." : "Заполнить форму"}
            </button>
          </div>
        </div>
      )}

      <div className="form-section">
        <div className="form-section-head">
          <h2>Картинки товара</h2>
          <label className="btn btn-secondary btn-sm">
            <HugeiconsIcon icon={ImageAdd01Icon} size={16} strokeWidth={1.8} />
            Добавить картинки
            <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(e) => addImages(e.target.files)} hidden />
          </label>
        </div>
        {images.length ? (
          <>
            <div className="image-manager-preview">
              <img src={previewImage.url} alt={previewImage.name} />
            </div>
            <div className="image-manager-grid">
              {images.map((image) => (
                <div className="image-manager-thumb" key={image.id}>
                  <button
                    type="button"
                    className={image.id === previewImage.id ? "is-active" : ""}
                    onClick={() => setPreviewImageId(image.id)}
                    aria-label={`Выбрать ${image.name} как превью`}
                  >
                    <img src={image.url} alt={image.name} />
                  </button>
                  <button type="button" className="image-manager-remove" onClick={() => removeImage(image.id)} aria-label={`Удалить ${image.name}`}>
                    <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="image-manager-empty">Картинки еще не выбраны</div>
        )}
      </div>

      {(!aiMode || aiDraftApplied) && (
        <>
          <label>Название<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label>
          <label>Описание<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <div className="form-section">
            <div className="segmented segmented-sm">
              <button type="button" className={priceMode === "number" ? "is-active" : ""} onClick={() => setPriceMode("number")}>Цена</button>
              <button type="button" className={priceMode === "ask" ? "is-active" : ""} onClick={() => setPriceMode("ask")}>Уточнить у продавца</button>
            </div>
            {priceMode === "number" ? (
              <label>Цена<input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></label>
            ) : (
              <label>Цена<input value="Уточнить у продавца" disabled /></label>
            )}
          </div>
          <label>Категория<input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></label>
          <div className="inline-fields">
            <label>
              Наличие
              <Select
                ariaLabel="Наличие"
                value={form.status}
                onChange={(value) => setForm({ ...form, status: value as ProductStatus })}
                options={[
                  { value: "AVAILABLE", label: "В наличии" },
                  { value: "CHECK_IN_STORE", label: "Уточнить в магазине" },
                  { value: "NOT_AVAILABLE", label: "Нет в наличии" }
                ]}
              />
            </label>
            <label className="inline-field">
              <input
                type="checkbox"
                checked={Boolean(form.isVisible)}
                onChange={(e) => setForm({ ...form, isVisible: e.target.checked ? 1 : 0 })}
              />
              Показывать в витрине
            </label>
          </div>
          <div className="form-section">
            <div className="form-section-head">
              <h2>Комбинации товара</h2>
            </div>
            <div className="variant-table">
              <div className="variant-table-head" aria-hidden="true">
                <span>Цвет</span>
                <span>HEX</span>
                <span>Размер</span>
                <span>Цена</span>
              </div>
              {variants.map((variant) => (
                <div className="variant-row" key={variant.id}>
                  <div className="variant-row-fields">
                    <input aria-label="Цвет" value={variant.colorName} onChange={(e) => updateVariant(variant.id, { colorName: e.target.value })} placeholder="Синий" />
                    <input
                      aria-label="HEX"
                      type="color"
                      value={variant.colorHex || "#2779a7"}
                      onChange={(e) => updateVariant(variant.id, { colorHex: e.target.value })}
                    />
                    <input aria-label="Размер" value={variant.size} onChange={(e) => updateVariant(variant.id, { size: e.target.value })} placeholder="M" />
                    <input aria-label="Цена" type="number" value={variant.price} onChange={(e) => updateVariant(variant.id, { price: e.target.value })} placeholder={form.price || "0"} />
                  </div>
                  <div className="variant-row-actions">
                    <button type="button" className="btn-icon btn-danger" aria-label="Удалить комбинацию" onClick={() => removeVariant(variant.id)}>
                      <HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={1.8} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setVariants([...variants, createEmptyVariant()])}>
              Добавить комбинацию
            </button>
          </div>
          <button className="btn btn-primary btn-lg">Сохранить</button>
        </>
      )}
      {aiSuccessVisible && (
        <div className="notice-banner notice-success" role="status">
          <HugeiconsIcon icon={CheckmarkCircle02Icon} size={18} strokeWidth={1.8} />
          ИИ закончил обработку. Проверьте заполненные поля.
        </div>
      )}
    </form>
  );
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

