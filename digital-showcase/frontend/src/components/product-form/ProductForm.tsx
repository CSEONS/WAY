import { AiMagicIcon, Edit02Icon, InformationCircleIcon, LockKeyIcon } from "@hugeicons/core-free-icons";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Product, ProductStatus } from "../../types/models";
import { Button, Card, CardHeader, Chip, ChipGroup, ConfirmModal, Field, Input, Notice, SegmentedControl, Textarea, useToast } from "../../ui";
import { AiBadge } from "./AiBadge";
import { AiPanel } from "./AiPanel";
import { ASK_SELLER, hasDraftContent, readSavedDraft } from "./helpers";
import { ImageManager, useImageManager } from "./ImageManager";
import {
  CATEGORY_PRESETS,
  emptySimpleDetails,
  simpleFromDraft,
  simpleFromProduct,
  simplePayload,
  simpleToVariantRows,
  simplifyVariantRows,
  variantsToSimple,
  type SimpleDetails as SimpleDetailsValue
} from "./simple";
import { SimpleDetails, type SimpleField } from "./SimpleDetails";
import { StatusCard } from "./StatusCard";
import type { DetailsMode, ProductDraft, ProductFormState, ProductImageSelection, ProductPayload, SavedProductFormDraft } from "./types";
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

type AiField = "title" | "description" | "category" | "price" | "sizes" | "colors";

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
  const initialSimple = useMemo(() => simpleFromProduct(initial), [initial]);
  const [form, setForm] = useState<ProductFormState>(
    savedDraft?.form ?? {
      title: initial?.title ?? "",
      description: initial?.description ?? "",
      category: initial?.category ?? "",
      status: initial?.status ?? "AVAILABLE",
      isVisible: initial?.isVisible ?? 1
    }
  );
  // A new product starts with the AI when the store has it: photos + voice is the easiest way in.
  const [aiMode, setAiMode] = useState(aiFormEnabled && !initial && !savedDraft);
  const [aiPrompt, setAiPrompt] = useState(savedDraft?.aiPrompt ?? "");
  const [aiDraftApplied, setAiDraftApplied] = useState(false);
  const [aiFilled, setAiFilled] = useState<Set<AiField>>(new Set());
  const [isDraftNoticeVisible, setIsDraftNoticeVisible] = useState(Boolean(savedDraft));
  const [mode, setMode] = useState<DetailsMode>(savedDraft?.mode ?? (initialSimple ? "simple" : "advanced"));
  const [simple, setSimple] = useState<SimpleDetailsValue>(savedDraft?.simple ?? initialSimple ?? emptySimpleDetails);
  const [isSimplifyConfirmOpen, setIsSimplifyConfirmOpen] = useState(false);
  const hasSubmittedRef = useRef(false);
  const imageManager = useImageManager(initial);
  const builder = useVariantBuilder(initial, savedDraft, draftKey);
  const { variants } = builder;

  useEffect(() => {
    if (!draftKey) return;
    const draft: SavedProductFormDraft = { form, aiPrompt, variants, mode, simple };
    if (!hasDraftContent(draft)) {
      localStorage.removeItem(draftKey);
      return;
    }
    localStorage.setItem(draftKey, JSON.stringify(draft));
  }, [aiPrompt, draftKey, form, variants, mode, simple]);

  function clearSavedDraft() {
    if (draftKey) localStorage.removeItem(draftKey);
    setIsDraftNoticeVisible(false);
  }

  function editedByOwner(...fields: AiField[]) {
    setAiFilled((current) => {
      if (!fields.some((field) => current.has(field))) return current;
      const next = new Set(current);
      fields.forEach((field) => next.delete(field));
      return next;
    });
  }

  function updateForm(patch: Partial<ProductFormState>) {
    setForm((current) => ({ ...current, ...patch }));
    editedByOwner(...(Object.keys(patch) as AiField[]));
  }

  function updateSimple(field: SimpleField, update: (current: SimpleDetailsValue) => SimpleDetailsValue) {
    editedByOwner(field);
    setSimple(update);
  }

  function switchToAdvanced() {
    builder.replaceRows(simpleToVariantRows(simple));
    setMode("advanced");
  }

  function switchToSimple() {
    if (variantsToSimple(variants)) {
      applySimplification();
      return;
    }
    setIsSimplifyConfirmOpen(true);
  }

  function applySimplification() {
    setSimple(simplifyVariantRows(variants));
    setMode("simple");
    setIsSimplifyConfirmOpen(false);
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
    const draftSimple = simpleFromDraft(draft);
    if (draftSimple) {
      setSimple(draftSimple);
      setMode("simple");
    } else {
      setMode("advanced");
    }

    const filled = new Set<AiField>();
    if (draft.title) filled.add("title");
    if (draft.description) filled.add("description");
    if (draft.category) filled.add("category");
    if (draftSimple?.price) filled.add("price");
    if (draftSimple?.sizes.length) filled.add("sizes");
    if (draftSimple?.colors.length) filled.add("colors");
    setAiFilled(filled);
    setAiDraftApplied(true);
    toast.show("ИИ заполнил форму. Проверьте поля с пометкой «ИИ».", { tone: "success" });
  }

  function advancedPayload() {
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
    const hasVariantPrices = normalizedVariants.some((variant) => variant.price != null);
    return {
      // With per-variant prices the cards show «from» the lowest one.
      price: hasVariantPrices ? null : initial?.price ?? null,
      priceText: initial?.priceText ?? null,
      sizes,
      colors: [...colorsByName.values()],
      variants: normalizedVariants
    };
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (hasSubmittedRef.current) return;
    hasSubmittedRef.current = true;

    onSubmit(
      {
        title: form.title,
        description: form.description || null,
        category: form.category || null,
        status: form.status as ProductStatus,
        isVisible: Number(form.isVisible),
        ...(mode === "simple" ? simplePayload(simple) : advancedPayload())
      },
      { images: imageManager.images, previewImageId: imageManager.previewImageId }
    );
    clearSavedDraft();
  }

  const isVisible = Boolean(form.isVisible);
  const submitLabel = initial ? "Сохранить изменения" : isVisible ? "Опубликовать" : "Сохранить черновик";

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
          Восстановлен несохранённый черновик
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
            { value: "ai", label: "С помощью ИИ", icon: AiMagicIcon },
            { value: "manual", label: "Вручную", icon: Edit02Icon }
          ]}
        />
      ) : (
        <Notice icon={LockKeyIcon} title="ИИ недоступен">
          Администратор ещё не подключил заполнение с помощью ИИ для этого магазина.
        </Notice>
      )}

      {aiMode && !aiDraftApplied && (
        <Notice tone="accent" icon={AiMagicIcon} title="Три шага">
          1. Сфотографируйте товар. 2. Расскажите о нём голосом или текстом. 3. Проверьте, что заполнил ИИ, и опубликуйте.
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
          ИИ заполнил форму — проверьте поля с пометкой «ИИ».
        </Notice>
      )}

      <ImageManager manager={imageManager} />

      {aiMode && !aiDraftApplied && (
        <AiPanel prompt={aiPrompt} onPromptChange={setAiPrompt} images={imageManager.images} aiDraftPath={aiDraftPath} onDraft={applyDraft} />
      )}

      {(!aiMode || aiDraftApplied) && (
        <>
          <Card as="section" className={styles.section}>
            <CardHeader title="Описание" />
            <Field
              label={
                <>
                  Название <AiBadge show={aiFilled.has("title")} />
                </>
              }
              required
            >
              <Input value={form.title} onChange={(e) => updateForm({ title: e.target.value })} placeholder="Например, льняное платье" required />
            </Field>
            <Field
              label={
                <>
                  Описание <AiBadge show={aiFilled.has("description")} />
                </>
              }
            >
              <Textarea value={form.description} onChange={(e) => updateForm({ description: e.target.value })} placeholder="Ткань, посадка, уход" />
            </Field>
            <Field
              label={
                <>
                  Категория <AiBadge show={aiFilled.has("category")} />
                </>
              }
            >
              <Input value={form.category} onChange={(e) => updateForm({ category: e.target.value })} placeholder="Выберите ниже или впишите свою" />
            </Field>
            <ChipGroup label="Частые категории">
              {CATEGORY_PRESETS.map((category) => (
                <Chip key={category} selected={form.category === category} onClick={() => updateForm({ category: form.category === category ? "" : category })}>
                  {category}
                </Chip>
              ))}
            </ChipGroup>
          </Card>

          {mode === "simple" ? (
            <SimpleDetails value={simple} onChange={updateSimple} aiFilled={aiFilled} onSwitchToAdvanced={switchToAdvanced} />
          ) : (
            <VariantBuilder
              builder={builder}
              onOpenModal={(type) => builder.openModal(type, imageManager.previewImageId ?? imageManager.images[0]?.id ?? null)}
              onSwitchToSimple={switchToSimple}
            />
          )}

          <StatusCard
            isVisible={isVisible}
            status={form.status}
            onVisibleChange={(value) => updateForm({ isVisible: value ? 1 : 0 })}
            onStatusChange={(status) => updateForm({ status })}
          />

          <Button type="submit" variant="primary" size="lg" block>
            {submitLabel}
          </Button>
        </>
      )}
      <VariantModal builder={builder} images={imageManager.images} />
      {isSimplifyConfirmOpen && (
        <ConfirmModal
          title="Одна цена для всех?"
          description="Сейчас у размеров или цветов разные цены. Останется одна цена — первая из списка. Её можно будет поменять."
          confirmLabel="Да, одна цена"
          onCancel={() => setIsSimplifyConfirmOpen(false)}
          onConfirm={applySimplification}
        />
      )}
    </form>
  );
}
