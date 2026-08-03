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
import type { Product, ProductStatus } from "../types/models";

interface VariantFormRow {
  id: string;
  colorName: string;
  colorHex: string;
  size: string;
  price: string;
}

interface ColorHistoryItem {
  name: string;
  hex: string;
}

interface VariantModalState {
  type: "color" | "size" | "price" | "all-colors" | "all-sizes" | "all-prices";
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

function normalizeHex(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "#2779A7";
  const withHash = raw.startsWith("#") ? raw : `#${raw}`;
  return /^#[0-9a-fA-F]{6}$/.test(withHash) ? withHash.toUpperCase() : "#2779A7";
}

function normalizeSize(value: string): string {
  return value.trim().toUpperCase();
}

function uniqueColorHistory(source: VariantFormRow[]): ColorHistoryItem[] {
  const map = new Map<string, ColorHistoryItem>();
  for (const variant of source) {
    const name = variant.colorName.trim();
    if (!name) continue;
    const hex = normalizeHex(variant.colorHex);
    if (!map.has(name.toLowerCase())) map.set(name.toLowerCase(), { name, hex });
  }

  return [...map.values()];
}

function initialColorHistory(initial?: Product, savedDraft?: SavedProductFormDraft | null): ColorHistoryItem[] {
  const fromDraft = savedDraft?.variants?.length ? savedDraft.variants : [];
  const fromInitial = initialVariants(initial);
  const merged = uniqueColorHistory([...fromDraft, ...fromInitial]);
  return merged.length
    ? merged
    : [
        { name: "#1A1A1A", hex: "#1A1A1A" },
        { name: "#E5533D", hex: "#E5533D" },
        { name: "#2D8CF0", hex: "#2D8CF0" },
        { name: "#16A34A", hex: "#16A34A" }
      ];
}

function initialSizeHistory(initial?: Product, savedDraft?: SavedProductFormDraft | null): string[] {
  const values = [...(savedDraft?.variants ?? []), ...initialVariants(initial)]
    .map((variant) => normalizeSize(variant.size))
    .filter(Boolean);
  return [...new Set(values)].length ? [...new Set(values)] : ["S", "M", "L", "XL"];
}

function initialPriceHistory(initial?: Product, savedDraft?: SavedProductFormDraft | null): string[] {
  const values = [...(savedDraft?.variants ?? []), ...initialVariants(initial)]
    .map((variant) => variant.price.trim())
    .filter(Boolean);
  if (savedDraft?.form.price?.trim()) values.unshift(savedDraft.form.price.trim());
  if (initial?.price != null) values.unshift(String(initial.price));
  return [...new Set(values)].length ? [...new Set(values)] : ["990", "1990", "2990"];
}

function formatPrice(value: string): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? `${amount.toLocaleString("ru-RU")} ₽` : `${value} ₽`;
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

  return [];
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
  const [colorHistory, setColorHistory] = useState<ColorHistoryItem[]>(() => initialColorHistory(initial, savedDraft));
  const [sizeHistory, setSizeHistory] = useState<string[]>(() => initialSizeHistory(initial, savedDraft));
  const [priceHistory, setPriceHistory] = useState<string[]>(() => initialPriceHistory(initial, savedDraft));
  const [selectedColorName, setSelectedColorName] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedPrice, setSelectedPrice] = useState<string | null>(null);
  const [variantModal, setVariantModal] = useState<VariantModalState | null>(null);
  const [draftColorHex, setDraftColorHex] = useState("#94A3B8");
  const [draftSize, setDraftSize] = useState("");
  const [draftPrice, setDraftPrice] = useState("");
  const [images, setImages] = useState<ProductFormImage[]>(() => initialImages(initial));
  const [previewImageId, setPreviewImageId] = useState<string | null>(() => initial?.images[0]?.id ?? null);
  const [isDraftNoticeVisible, setIsDraftNoticeVisible] = useState(Boolean(savedDraft));
  const previewImage = images.find((image) => image.id === previewImageId) ?? images[0];
  const selectedColor = selectedColorName ? colorHistory.find((color) => color.name === selectedColorName) ?? null : null;
  const canAddVariant = Boolean(selectedColor && selectedSize && (priceMode === "ask" || (selectedPrice ?? "").trim()));

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

  useEffect(() => {
    if (priceMode === "ask") setSelectedPrice(null);
  }, [priceMode]);

  useEffect(() => {
    if (!variantModal) return;
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") closeVariantModal();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [variantModal]);

  function clearSavedDraft() {
    if (draftKey) localStorage.removeItem(draftKey);
    setIsDraftNoticeVisible(false);
  }

  function rememberColor(color: ColorHistoryItem) {
    const normalized = { name: color.name.trim(), hex: normalizeHex(color.hex) };
    if (!normalized.name) return;
    setColorHistory((current) => {
      const next = [normalized, ...current.filter((item) => item.name.toLowerCase() !== normalized.name.toLowerCase())];
      return next;
    });
  }

  function rememberSize(value: string) {
    const normalized = normalizeSize(value);
    if (!normalized) return;
    setSizeHistory((current) => [normalized, ...current.filter((item) => item !== normalized)]);
  }

  function rememberPrice(value: string) {
    const normalized = value.trim();
    if (!normalized) return;
    setPriceHistory((current) => [normalized, ...current.filter((item) => item !== normalized)]);
  }

  function openVariantModal(type: VariantModalState["type"]) {
    setVariantModal({ type });
    if (type === "color") {
      setDraftColorHex("#94A3B8");
    }
    if (type === "size") setDraftSize("");
    if (type === "price") setDraftPrice("");
  }

  function closeVariantModal() {
    setVariantModal(null);
  }

  function updateVariant(id: string, patch: Partial<VariantFormRow>) {
    setVariants((current) => current.map((variant) => (variant.id === id ? { ...variant, ...patch } : variant)));
  }

  function removeVariant(id: string) {
    setVariants((current) => current.filter((variant) => variant.id !== id));
  }

  function addVariantFromSelection() {
    if (!selectedColor || !selectedSize) return;
    const nextPrice = priceMode === "number" ? (selectedPrice ?? "").trim() : "";
    const variantPayload = {
      colorName: selectedColor.name,
      colorHex: normalizeHex(selectedColor.hex),
      size: selectedSize,
      price: nextPrice
    };

    setVariants((current) => {
      const existing = current.findIndex((variant) => variant.colorName === variantPayload.colorName && normalizeSize(variant.size) === variantPayload.size);
      if (existing >= 0) {
        return current.map((variant, index) => (index === existing ? { ...variant, ...variantPayload } : variant));
      }

      return [...current, { id: createId(), ...variantPayload }];
    });

    rememberColor(selectedColor);
    rememberSize(selectedSize);
    if (nextPrice) rememberPrice(nextPrice);
    setSelectedSize(null);
    setSelectedPrice(null);
  }

  function submitNewColor() {
    const hex = normalizeHex(draftColorHex);
    const color = { name: hex, hex };
    rememberColor(color);
    setSelectedColorName(color.name);
    closeVariantModal();
  }

  function submitNewSize() {
    const value = normalizeSize(draftSize);
    if (!value) return;
    rememberSize(value);
    setSelectedSize(value);
    closeVariantModal();
  }

  function submitNewPrice() {
    const value = draftPrice.trim();
    if (!value) return;
    rememberPrice(value);
    setSelectedPrice(value);
    closeVariantModal();
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
      const nextVariants = draft.variants.map((variant) => ({
        id: createId(),
        colorName: variant.colorName,
        colorHex: variant.colorHex ?? "#2779a7",
        size: variant.size,
        price: variant.price?.toString() ?? ""
      }));
      setVariants(nextVariants);
      setColorHistory((current) => {
        const merged = uniqueColorHistory([
          ...nextVariants,
          ...current.map((color) => ({ id: createId(), colorName: color.name, colorHex: color.hex, size: "", price: "" }))
        ]);
        return merged.length ? merged : current;
      });
      setSizeHistory((current) => [...new Set([...nextVariants.map((variant) => normalizeSize(variant.size)).filter(Boolean), ...current])]);
      setPriceHistory((current) => [...new Set([...nextVariants.map((variant) => variant.price.trim()).filter(Boolean), ...current])]);
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
          <label className="image-manager-empty">
            Картинки еще не выбраны
            <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(e) => addImages(e.target.files)} hidden />
          </label>
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
            <p className="form-section-hint variant-builder-hint">
              {priceMode === "ask"
                ? "Выберите цвет и размер, затем добавьте комбинацию. Цена будет уточняться у продавца."
                : "Выберите цвет, размер и цену, затем добавьте комбинацию. Если цена не указана, используйте цену товара выше."}
            </p>
            <div className="variant-builder-block">
              <span className="variant-builder-label">Цвет</span>
              <div className="variant-chip-row">
                {colorHistory.map((color) => (
                  <button
                    key={`${color.name}-${color.hex}`}
                    type="button"
                    className={`variant-color-chip${selectedColorName === color.name ? " is-selected" : ""}`}
                    onClick={() => setSelectedColorName((current) => (current === color.name ? null : color.name))}
                    title={color.name}
                  >
                    <span className="variant-color-chip-swatch" style={{ background: color.hex }} />
                  </button>
                ))}
                <button type="button" className="variant-action-chip" onClick={() => openVariantModal("color")} aria-label="Новый цвет">+</button>
                <button type="button" className="variant-action-chip" onClick={() => openVariantModal("all-colors")}>Все</button>
              </div>
            </div>
            <div className="variant-builder-block">
              <span className="variant-builder-label">Размер</span>
              <div className="variant-chip-row">
                {sizeHistory.map((size) => (
                  <button
                    key={size}
                    type="button"
                    className={`variant-size-chip${selectedSize === size ? " is-selected" : ""}`}
                    onClick={() => setSelectedSize((current) => (current === size ? null : size))}
                  >
                    {size}
                  </button>
                ))}
                <button type="button" className="variant-action-chip" onClick={() => openVariantModal("size")} aria-label="Новый размер">+</button>
                <button type="button" className="variant-action-chip" onClick={() => openVariantModal("all-sizes")}>Все</button>
              </div>
            </div>
            {priceMode === "number" && (
              <div className="variant-builder-block">
                <span className="variant-builder-label">Цена</span>
                <div className="variant-chip-row">
                  {priceHistory.map((price) => (
                    <button
                      key={price}
                      type="button"
                      className={`variant-price-chip${selectedPrice === price ? " is-selected" : ""}`}
                      onClick={() => setSelectedPrice((current) => (current === price ? null : price))}
                    >
                      {formatPrice(price)}
                    </button>
                  ))}
                  <button type="button" className="variant-action-chip" onClick={() => openVariantModal("price")} aria-label="Новая цена">+</button>
                  <button type="button" className="variant-action-chip" onClick={() => openVariantModal("all-prices")}>Все</button>
                </div>
              </div>
            )}
            <button type="button" className="btn btn-primary variant-add-btn" disabled={!canAddVariant} onClick={addVariantFromSelection}>
              Добавить комбинацию
            </button>
            <div className="variant-table-header">
              <span className="variant-builder-label">Добавленные комбинации</span>
              <span className="variant-table-count">
                {variants.length ? `${variants.length} ${variants.length === 1 ? "комбинация" : variants.length < 5 ? "комбинации" : "комбинаций"}` : ""}
              </span>
            </div>
            <div className="variant-table">
              {variants.length ? (
                variants.map((variant, index) => (
                  <div className="variant-list-row" key={variant.id}>
                    <div className="variant-list-name">
                      <span className="variant-color-chip-swatch" style={{ background: normalizeHex(variant.colorHex) }} title={variant.colorName} />
                      <span>{normalizeSize(variant.size)}</span>
                    </div>
                    {priceMode === "number" ? (
                      <input
                        className="variant-list-price"
                        type="number"
                        value={variant.price}
                        onChange={(e) => updateVariant(variant.id, { price: e.target.value })}
                        placeholder={form.price || "Цена"}
                        aria-label={`Цена комбинации ${index + 1}`}
                      />
                    ) : (
                      <span className="variant-list-note">у продавца</span>
                    )}
                    <button type="button" className="btn-icon btn-danger" aria-label={`Удалить комбинацию ${index + 1}`} onClick={() => removeVariant(variant.id)}>
                      <HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={1.8} />
                    </button>
                  </div>
                ))
              ) : (
                <div className="variant-empty">Комбинации еще не добавлены</div>
              )}
            </div>
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
      {variantModal && (
        <div className="modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) closeVariantModal(); }}>
          <div className="modal variant-modal">
            <div className="modal-head">
              <div className="modal-title">
                <h2>
                  {variantModal.type === "color" && "Новый цвет"}
                  {variantModal.type === "size" && "Новый размер"}
                  {variantModal.type === "price" && "Новая цена"}
                  {variantModal.type === "all-colors" && "Все цвета"}
                  {variantModal.type === "all-sizes" && "Все размеры"}
                  {variantModal.type === "all-prices" && "Все цены"}
                </h2>
              </div>
              <button type="button" className="btn-icon btn-ghost" onClick={closeVariantModal} aria-label="Закрыть">
                <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.8} />
              </button>
            </div>
            {variantModal.type === "color" && (
              <div className="variant-modal-form">
                <label>
                  Цвет
                  <div className="variant-color-input">
                    <input type="color" value={normalizeHex(draftColorHex)} onChange={(e) => setDraftColorHex(e.target.value)} />
                    <input value={normalizeHex(draftColorHex)} onChange={(e) => setDraftColorHex(e.target.value.toUpperCase())} placeholder="#2779A7" />
                  </div>
                </label>
                <button type="button" className="btn btn-primary" onClick={submitNewColor}>Добавить</button>
              </div>
            )}
            {variantModal.type === "size" && (
              <div className="variant-modal-form">
                <label>
                  Размер
                  <input value={draftSize} onChange={(e) => setDraftSize(e.target.value)} placeholder="Например, M или 42" />
                </label>
                <button type="button" className="btn btn-primary" onClick={submitNewSize}>Добавить</button>
              </div>
            )}
            {variantModal.type === "price" && (
              <div className="variant-modal-form">
                <label>
                  Цена
                  <input type="number" value={draftPrice} onChange={(e) => setDraftPrice(e.target.value)} placeholder="Например, 1990" />
                </label>
                <button type="button" className="btn btn-primary" onClick={submitNewPrice}>Добавить</button>
              </div>
            )}
            {variantModal.type === "all-colors" && (
              <div className="variant-modal-grid">
                {colorHistory.map((color) => (
                  <button
                    key={`${color.name}-${color.hex}-all`}
                    type="button"
                    className="variant-color-chip"
                    title={color.name}
                    onClick={() => {
                      setSelectedColorName(color.name);
                      closeVariantModal();
                    }}
                  >
                    <span className="variant-color-chip-swatch" style={{ background: color.hex }} />
                  </button>
                ))}
              </div>
            )}
            {variantModal.type === "all-sizes" && (
              <div className="variant-modal-grid">
                {sizeHistory.map((size) => (
                  <button key={`${size}-all`} type="button" className="variant-size-chip" onClick={() => { setSelectedSize(size); closeVariantModal(); }}>
                    {size}
                  </button>
                ))}
              </div>
            )}
            {variantModal.type === "all-prices" && (
              <div className="variant-modal-grid">
                {priceHistory.map((price) => (
                  <button key={`${price}-all`} type="button" className="variant-price-chip" onClick={() => { setSelectedPrice(price); closeVariantModal(); }}>
                    {formatPrice(price)}
                  </button>
                ))}
              </div>
            )}
          </div>
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
