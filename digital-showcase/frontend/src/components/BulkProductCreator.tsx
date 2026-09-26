import { CloudUploadIcon, Mic01Icon, TextFontIcon } from "@hugeicons/core-free-icons";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { useVoiceRecorder } from "../hooks/useVoiceRecorder";
import type { Product, ProductStatus } from "../types/models";
import { Button, Card, Field, FileButton, Input, Modal, Notice, SegmentedControl, Select, Textarea } from "../ui";
import { VoiceQuestions, VoiceStatus, voiceButtonLabel } from "./VoiceRecorder";
import styles from "./BulkProductCreator.module.css";

const bulkQuestions = [
  "Сколько товаров на фотографиях и какие фото к какому товару относятся?",
  "Как называется каждый товар?",
  "Какие цвета и размеры есть у каждого товара?",
  "Сколько стоит каждый товар или отдельные комбинации?",
  "К какой категории отнести каждый товар?"
];

const statusOptions = [
  { value: "AVAILABLE", label: "В наличии" },
  { value: "CHECK_IN_STORE", label: "Уточнить у продавца" },
  { value: "NOT_AVAILABLE", label: "Нет в наличии" }
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
  const [drafts, setDrafts] = useState<BulkDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const recorder = useVoiceRecorder(setError);
  const previews = useMemo(() => images.map((file) => URL.createObjectURL(file)), [images]);
  const isBusy = loading || saving;

  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  async function groupImages() {
    setError("");
    setLoading(true);
    try {
      const formData = new FormData();
      images.forEach((image) => formData.append("images", image));
      if (inputMode === "text" && prompt.trim()) formData.append("prompt", prompt.trim());
      if (inputMode === "voice" && recorder.blob) formData.append("voice", recorder.blob, "bulk-products-voice.webm");
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

  const footer = drafts.length ? (
    <>
      <Button variant="secondary" onClick={() => setDrafts([])} disabled={saving}>
        Назад
      </Button>
      <Button variant="primary" onClick={createProducts} loading={saving} disabled={drafts.some((draft) => !draft.title.trim())}>
        {saving ? "Создаю товары…" : `Создать товары (${drafts.length})`}
      </Button>
    </>
  ) : (
    <Button variant="primary" size="lg" disabled={images.length < 2} loading={loading} onClick={groupImages}>
      {loading ? "ИИ группирует изображения…" : "Сгруппировать"}
    </Button>
  );

  return (
    <Modal
      size="lg"
      title="Массовое добавление товаров"
      description="ИИ сгруппирует фотографии. Перед созданием проверьте предложения."
      onClose={() => {
        if (!isBusy) onClose();
      }}
      hideCloseButton={isBusy}
      closeOnBackdrop={false}
      footer={footer}
    >
      {!drafts.length ? (
        <>
          <div className={styles.upload}>
            <FileButton icon={CloudUploadIcon} accept="image/jpeg,image/png,image/webp" multiple onFiles={(files) => setImages(files.slice(0, 40))}>
              {images.length ? "Выбрать другие фото" : "Выбрать фотографии"}
            </FileButton>
            <span className={styles.uploadHint}>
              {images.length ? `Выбрано фотографий: ${images.length}` : "От 2 до 40 фотографий товаров"}
            </span>
          </div>
          {previews.length > 0 && (
            <div className={styles.previewGrid}>
              {previews.map((url, index) => (
                <img src={url} alt={`Изображение ${index + 1}`} key={url} />
              ))}
            </div>
          )}
          <SegmentedControl
            label="Способ описания"
            size="sm"
            value={inputMode}
            onChange={setInputMode}
            options={[
              { value: "text", label: "Текст", icon: TextFontIcon },
              { value: "voice", label: "Голос", icon: Mic01Icon }
            ]}
          />
          <VoiceQuestions questions={bulkQuestions} />
          {inputMode === "text" ? (
            <Field label="Текстовое описание">
              <Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Например: джинсы по 1000, носки по 50, размеры кепки 44…" />
            </Field>
          ) : (
            <div className={styles.voice}>
              <VoiceStatus recorder={recorder} />
              <Button variant="secondary" icon={Mic01Icon} onClick={recorder.toggle}>
                {voiceButtonLabel(recorder)}
              </Button>
            </div>
          )}
          {error && <Notice tone="danger">{error}</Notice>}
        </>
      ) : (
        <>
          {drafts.map((draft, index) => (
            <Card as="article" variant="muted" key={index} className={styles.draft}>
              <div className={styles.draftImages}>
                {draft.imageIndexes.map((imageIndex) => previews[imageIndex] && <img src={previews[imageIndex]} alt="" key={imageIndex} />)}
              </div>
              <div className={styles.draftFields}>
                <Field label="Название" required>
                  <Input value={draft.title} onChange={(event) => updateDraft(index, { title: event.target.value })} required />
                </Field>
                <Field label="Описание">
                  <Textarea value={draft.description ?? ""} onChange={(event) => updateDraft(index, { description: event.target.value || null })} />
                </Field>
                <Field label="Категория">
                  <Input value={draft.category ?? ""} onChange={(event) => updateDraft(index, { category: event.target.value || null })} />
                </Field>
                <Field label="Цена">
                  <Input
                    type="number"
                    value={draft.price ?? ""}
                    placeholder="Уточнить у продавца"
                    onChange={(event) =>
                      updateDraft(index, {
                        price: event.target.value ? Number(event.target.value) : null,
                        priceText: event.target.value ? null : "Уточнить у продавца",
                        status: event.target.value ? draft.status : "CHECK_IN_STORE"
                      })
                    }
                  />
                </Field>
                <Field label="Цвета" hint="Через запятую">
                  <Input
                    value={draft.colors.map((color) => color.name).join(", ")}
                    onChange={(event) =>
                      updateDraft(index, {
                        colors: event.target.value
                          .split(",")
                          .map((name) => ({ name: name.trim(), hex: null }))
                          .filter((color) => color.name)
                      })
                    }
                  />
                </Field>
                <Field label="Размеры" hint="Через запятую">
                  <Input
                    value={draft.sizes.join(", ")}
                    placeholder="Уточнить у продавца"
                    onChange={(event) => updateDraft(index, { sizes: event.target.value.split(",").map((size) => size.trim()).filter(Boolean) })}
                  />
                </Field>
                <Field label="Наличие">
                  <Select value={draft.status} onChange={(value) => updateDraft(index, { status: value as ProductStatus })} options={statusOptions} />
                </Field>
              </div>
            </Card>
          ))}
          {error && <Notice tone="danger">{error}</Notice>}
          {progress && <Notice tone="accent">{progress}</Notice>}
        </>
      )}
    </Modal>
  );
}
