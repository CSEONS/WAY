import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { Product, ProductStatus } from "../types/models";

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
  const [voice, setVoice] = useState<File | null>(null);
  const [prompt, setPrompt] = useState("");
  const [drafts, setDrafts] = useState<BulkDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const previews = useMemo(() => images.map((file) => URL.createObjectURL(file)), [images]);

  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  async function groupImages() {
    setError("");
    setLoading(true);
    try {
      const formData = new FormData();
      images.forEach((image) => formData.append("images", image));
      if (prompt.trim()) formData.append("prompt", prompt.trim());
      if (voice) formData.append("voice", voice);
      const { data } = await api.post<BulkDraft[]>(`/owner/stores/${storeId}/products/bulk-ai-draft`, formData);
      setDrafts(data);
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Не удалось сгруппировать товары");
    } finally {
      setLoading(false);
    }
  }

  function updateDraft(index: number, patch: Partial<BulkDraft>) {
    setDrafts((current) => current.map((draft, draftIndex) => draftIndex === index ? { ...draft, ...patch } : draft));
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
    <div role="presentation">
      <div role="dialog" aria-modal="true">
        <div>
          <div><h2>Массовое добавление товаров</h2><p>ИИ сгруппирует фотографии. Перед созданием проверьте предложения.</p></div>
          <button type="button" aria-label="Закрыть" onClick={onClose} disabled={loading || saving}>×</button>
        </div>
        {!drafts.length ? (
          <div>
            <label>Фотографии товаров (от 2 до 40)<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setImages([...event.target.files ?? []].slice(0, 40))} /></label>
            {previews.length > 0 && <div>{previews.map((url, index) => <img src={url} alt={`Изображение ${index + 1}`} key={url} />)}</div>}
            <label>Текстовое описание<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Например: джинсы по 1000, носки по 50, размеры кепки 44..." /></label>
            <label>Или голосовой файл<input type="file" accept="audio/*,video/webm" onChange={(event) => setVoice(event.target.files?.[0] ?? null)} /></label>
            {error && <p>{error}</p>}
            <button type="button" disabled={images.length < 2 || loading} onClick={groupImages}>{loading && <span />}{loading ? "ИИ группирует изображения..." : "Сгруппировать"}</button>
          </div>
        ) : (
          <div>
            {drafts.map((draft, index) => (
              <article key={index}>
                <div>{draft.imageIndexes.map((imageIndex) => previews[imageIndex] && <img src={previews[imageIndex]} alt="" key={imageIndex} />)}</div>
                <div>
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
            {error && <p>{error}</p>}
            {progress && <p role="status">{progress}</p>}
            <div><button type="button" onClick={() => setDrafts([])} disabled={saving}>Назад</button><button type="button" onClick={createProducts} disabled={saving || drafts.some((draft) => !draft.title.trim())}>{saving ? "Создаю товары..." : `Создать товары (${drafts.length})`}</button></div>
          </div>
        )}
      </div>
    </div>
  );
}
