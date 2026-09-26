import { AiMagicIcon, Edit02Icon, InformationCircleIcon, LockKeyIcon } from "@hugeicons/core-free-icons";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Product, ProductStatus } from "../../types/models";
import { Button, Card, CardHeader, Field, Input, Notice, SegmentedControl, Textarea, useToast } from "../../ui";
import { AiPanel } from "./AiPanel";
import { ASK_SELLER, hasDraftContent, readSavedDraft } from "./helpers";
import { ImageManager, useImageManager } from "./ImageManager";
import type { ProductDraft, ProductFormState, ProductImageSelection, ProductPayload, SavedProductFormDraft } from "./types";
import { useVariantBuilder } from "./useVariantBuilder";
import { VariantBuilder } from "./VariantBuilder";
import { VariantModal } from "./VariantModal";
import styles from "./ProductForm.module.css";

interface ProductFormProps {
  initial?: Product;
  aiDraftPath?: string;
  aiFormEnabled: boolean;
  /** localStorage key for the unsaved draft and remembered values. */
  draftKey?: string;
  onSubmit: (payload: ProductPayload, imageSelection: ProductImageSelection) => void;
}

// Ctrl/Cmd+A inside a field selects only that field's text, not the page.
function selectFieldText(event: KeyboardEvent<HTMLFormElement>) {
  if (!(event.ctrlKey || event.metaKey) || (event.key.toLowerCase() !== "a" && event.code !== "KeyA")) return;
  if (!(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) return;
  if (event.target.disabled || event.target.readOnly) return;
  if (event.target instanceof HTMLInputElement && ["button", "checkbox", "color", "file", "radio", "range", "submit"].includes(event.target.type)) return;

  event.preventDefault();
  event.target.select();
}

export function ProductForm({ initial, aiDraftPath, aiFormEnabled, draftKey, onSubmit }: ProductFormProps) {
  const toast = useToast();
  const savedDraft = useMemo(() => readSavedDraft(draftKey), [draftKey]);
  const [form, setForm] = useState<ProductFormState>(
    savedDraft?.form ?? {
      title: initial?.title ?? "",
      description: initial?.description ?? "",
      category: initial?.category ?? "",
      status: initial?.status ?? "AVAILABLE",
      isVisible: initial?.isVisible ?? 1
    }
  );
  const [aiMode, setAiMode] = useState(false);
  const [aiPrompt, setAiPrompt] = useState(savedDraft?.aiPrompt ?? "");
  const [aiDraftApplied, setAiDraftApplied] = useState(false);
  const [isDraftNoticeVisible, setIsDraftNoticeVisible] = useState(Boolean(savedDraft));
  const hasSubmittedRef = useRef(false);
  const imageManager = useImageManager(initial);
  const builder = useVariantBuilder(initial, savedDraft, draftKey);
  const { variants } = builder;

  useEffect(() => {
    if (!draftKey) return;
    const draft: SavedProductFormDraft = { form, aiPrompt, variants };
    if (!hasDraftContent(draft)) {
      localStorage.removeItem(draftKey);
      return;
    }
    localStorage.setItem(draftKey, JSON.stringify(draft));
  }, [aiPrompt, draftKey, form, variants]);

  function clearSavedDraft() {
    if (draftKey) localStorage.removeItem(draftKey);
    setIsDraftNoticeVisible(false);
  }

  function applyDraft(draft: ProductDraft) {
    setForm((current) => ({
      ...current,
      title: draft.title ?? current.title,
      description: draft.description ?? current.description,
      category: draft.category ?? current.category,
      status: draft.status ?? current.status,
      isVisible: draft.isVisible ?? current.isVisible
    }));
    builder.applyDraftVariants(draft.variants);
    setAiDraftApplied(true);
    toast.show("ИИ закончил обработку. Проверьте заполненные поля.", { tone: "success" });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (hasSubmittedRef.current) return;
    hasSubmittedRef.current = true;
    const normalizedVariants = variants
      .map((variant) => ({
        colorName: variant.colorName.trim(),
        colorHex: variant.colorHex.trim() || null,
        size: variant.size.trim(),
        price: variant.price && variant.price !== ASK_SELLER ? Number(variant.price) : null
      }))
      .filter((variant) => variant.colorName && variant.size);
    const sizes = [...new Set(normalizedVariants.map((variant) => variant.size))];
    const colorsByName = new Map<string, { name: string; hex: string | null }>();
    for (const variant of normalizedVariants) {
      if (!colorsByName.has(variant.colorName)) colorsByName.set(variant.colorName, { name: variant.colorName, hex: variant.colorHex });
    }

    onSubmit(
      {
        title: form.title,
        description: form.description || null,
        price: initial?.price ?? null,
        priceText: initial?.priceText ?? null,
        category: form.category || null,
        status: form.status as ProductStatus,
        isVisible: Number(form.isVisible),
        sizes,
        colors: [...colorsByName.values()],
        variants: normalizedVariants
      },
      { images: imageManager.images, previewImageId: imageManager.previewImageId }
    );
    clearSavedDraft();
  }

  return (
    <form className={styles.form} onSubmit={submit} onKeyDownCapture={selectFieldText}>
      {isDraftNoticeVisible && (
        <Notice
          tone="accent"
          icon={InformationCircleIcon}
          action={
            <Button variant="ghost" size="sm" onClick={clearSavedDraft}>
              Очистить
            </Button>
          }
        >
          Восстановлен локальный черновик
        </Notice>
      )}

      {aiFormEnabled ? (
        <SegmentedControl
          label="Способ заполнения"
          value={aiMode ? "ai" : "manual"}
          onChange={(value) => {
            setAiMode(value === "ai");
            if (value === "ai") setAiDraftApplied(false);
          }}
          options={[
            { value: "manual", label: "Обычный ввод", icon: Edit02Icon },
            { value: "ai", label: "ИИ ввод", icon: AiMagicIcon }
          ]}
        />
      ) : (
        <Notice icon={LockKeyIcon} title="AI недоступен">
          Администратор ещё не подключил AI-заполнение для этого магазина.
        </Notice>
      )}

      {aiMode && aiDraftApplied && (
        <Notice
          tone="success"
          action={
            <Button variant="ghost" size="sm" onClick={() => setAiDraftApplied(false)}>
              Изменить запрос
            </Button>
          }
        >
          ИИ заполнил форму — проверьте результат ниже.
        </Notice>
      )}

      {aiMode && !aiDraftApplied && (
        <AiPanel prompt={aiPrompt} onPromptChange={setAiPrompt} images={imageManager.images} aiDraftPath={aiDraftPath} onDraft={applyDraft} />
      )}

      <ImageManager manager={imageManager} />

      {(!aiMode || aiDraftApplied) && (
        <>
          <Card as="section" className={styles.section}>
            <CardHeader title="Описание" />
            <Field label="Название" required>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </Field>
            <Field label="Описание">
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Field label="Категория">
              <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </Field>
          </Card>
          <VariantBuilder
            builder={builder}
            onOpenModal={(type) => builder.openModal(type, imageManager.previewImageId ?? imageManager.images[0]?.id ?? null)}
          />
          <Button type="submit" variant="primary" size="lg" block>
            Сохранить
          </Button>
        </>
      )}
      <VariantModal builder={builder} images={imageManager.images} />
    </form>
  );
}
