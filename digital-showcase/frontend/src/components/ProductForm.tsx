import { FormEvent, KeyboardEvent, useState } from "react";
import { api } from "../api/client";
import type { Product, ProductStatus } from "../types/models";

interface VariantFormRow {
  id: string;
  colorName: string;
  colorHex: string;
  size: string;
  price: string;
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

export function ProductForm({ initial, aiFormEnabled, onSubmit }: { initial?: Product; aiFormEnabled: boolean; onSubmit: (payload: ProductPayload, file?: File) => Promise<void> }) {
  const initialPriceMode = initial?.priceText === "Уточнить у продавца" ? "ask" : "number";
  const [form, setForm] = useState({
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    price: initial?.price?.toString() ?? "",
    category: initial?.category ?? "",
    status: initial?.status ?? "AVAILABLE",
    isVisible: initial?.isVisible ?? 1
  });
  const [priceMode, setPriceMode] = useState<"number" | "ask">(initialPriceMode);
  const [aiMode, setAiMode] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiError, setAiError] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [variants, setVariants] = useState<VariantFormRow[]>(() => initialVariants(initial));
  const [file, setFile] = useState<File>();

  function updateVariant(id: string, patch: Partial<VariantFormRow>) {
    setVariants((current) => current.map((variant) => (variant.id === id ? { ...variant, ...patch } : variant)));
  }

  function removeVariant(id: string) {
    setVariants((current) => (current.length > 1 ? current.filter((variant) => variant.id !== id) : [createEmptyVariant()]));
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
      const { data } = await api.post<ProductDraft>("/owner/products/ai-draft", { prompt: aiPrompt });
      applyDraft(data);
      setAiMode(false);
    } catch (err: any) {
      setAiError(err.response?.data?.message ?? "Не удалось заполнить форму");
    } finally {
      setAiLoading(false);
    }
  }

  function recordVoice() {
    const SpeechRecognition = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setAiError("Браузер не поддерживает голосовой ввод");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "ru-RU";
    recognition.interimResults = false;
    recognition.onstart = () => setIsListening(true);
    recognition.onerror = () => {
      setIsListening(false);
      setAiError("Не удалось распознать голос");
    };
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript;
      if (transcript) setAiPrompt((current) => [current, transcript].filter(Boolean).join(" "));
    };
    recognition.start();
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
      file
    );
  }

  return (
    <form className="form" onSubmit={submit} onKeyDownCapture={selectFieldText}>
      <div className="mode-switch">
        <span>Обычный ввод</span>
        <button className={aiMode ? "switch active" : "switch"} type="button" disabled={!aiFormEnabled} aria-pressed={aiMode} onClick={() => setAiMode(!aiMode)}>
          <span />
        </button>
        <span>ИИ ввод {!aiFormEnabled && <LockIcon />}</span>
      </div>
      {aiMode && (
        <div className="ai-draft-box">
          <label>
            Голосовое описание товара
            <textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder="Например: синее платье, размеры S и M, цена 4500 рублей, есть еще белый цвет..." />
          </label>
          {aiError && <p className="error">{aiError}</p>}
          <div className="section-head">
            <button type="button" onClick={recordVoice}>{isListening ? "Слушаю..." : "Надиктовать"}</button>
            <button className="primary" type="button" disabled={!aiPrompt.trim() || aiLoading} onClick={fillWithAi}>
              {aiLoading ? "Заполняю..." : "Заполнить форму"}
            </button>
          </div>
        </div>
      )}
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
      <div className="variant-editor">
        <div className="section-head">
          <h2>Комбинации товара</h2>
          <button type="button" onClick={() => setVariants([...variants, createEmptyVariant()])}>
            Добавить комбинацию
          </button>
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
      </div>
      <div className="form-grid">
        <label>Изображение<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0])} /></label>
      </div>
      <button className="primary">Сохранить</button>
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
