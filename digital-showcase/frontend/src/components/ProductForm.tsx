import { FormEvent, useState } from "react";
import type { Product, ProductStatus } from "../types/models";

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
}

export function ProductForm({ initial, onSubmit }: { initial?: Product; onSubmit: (payload: ProductPayload, file?: File) => Promise<void> }) {
  const [form, setForm] = useState({
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    price: initial?.price?.toString() ?? "",
    priceText: initial?.priceText ?? "",
    category: initial?.category ?? "",
    status: initial?.status ?? "AVAILABLE",
    isVisible: initial?.isVisible ?? 1,
    sizes: initial?.sizes.map((item) => item.value).join(", ") ?? "",
    colors: initial?.colors.map((item) => `${item.name}${item.hex ? `:${item.hex}` : ""}`).join(", ") ?? ""
  });
  const [file, setFile] = useState<File>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSubmit(
      {
        title: form.title,
        description: form.description || null,
        price: form.price ? Number(form.price) : null,
        priceText: form.priceText || null,
        category: form.category || null,
        status: form.status as ProductStatus,
        isVisible: Number(form.isVisible),
        sizes: form.sizes.split(",").map((item) => item.trim()).filter(Boolean),
        colors: form.colors
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
          .map((item) => {
            const [name, hex] = item.split(":");
            return { name: name.trim(), hex: hex?.trim() || null };
          })
      },
      file
    );
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>Название<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label>
      <label>Описание<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
      <div className="form-grid">
        <label>Цена<input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></label>
        <label>Текст цены<input value={form.priceText} onChange={(e) => setForm({ ...form, priceText: e.target.value })} placeholder="уточнить в магазине" /></label>
      </div>
      <label>Категория<input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></label>
      <label>Размеры<input value={form.sizes} onChange={(e) => setForm({ ...form, sizes: e.target.value })} placeholder="S, M, L" /></label>
      <label>Цвета<input value={form.colors} onChange={(e) => setForm({ ...form, colors: e.target.value })} placeholder="черный:#000000, белый:#ffffff" /></label>
      <div className="form-grid">
        <label>Статус<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ProductStatus })}><option value="AVAILABLE">В наличии</option><option value="NOT_AVAILABLE">Нет в наличии</option><option value="CHECK_IN_STORE">Уточнить</option></select></label>
        <label>Видимость<select value={form.isVisible} onChange={(e) => setForm({ ...form, isVisible: Number(e.target.value) })}><option value={1}>Показывать</option><option value={0}>Скрыть</option></select></label>
      </div>
      <label>Изображение<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0])} /></label>
      <button className="primary">Сохранить</button>
    </form>
  );
}
