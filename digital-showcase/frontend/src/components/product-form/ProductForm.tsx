import { AiEditingIcon, AiMagicIcon, Edit02Icon, InformationCircleIcon, LockKeyIcon } from "@hugeicons/core-free-icons";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Product, ProductStatus } from "../../types/models";
import { PRICE_ERROR, isValidPrice, parsePrice } from "../../utils/price";
import { Button, Card, CardHeader, Chip, ChipGroup, ConfirmModal, Field, Input, Notice, SegmentedControl, Textarea, useToast } from "../../ui";
import { AiBadge } from "./AiBadge";
import { AiFieldButton } from "./AiFieldButton";
import { type AiDraftField, requestAiDraft } from "./aiDraft";
import { AutoPanel } from "./AutoPanel";
import { ASK_SELLER, hasDraftContent, readSavedDraft } from "./helpers";
import { ImageManager, useImageManager } from "./ImageManager";
import { PreviewGenerator } from "./PreviewGenerator";
import { previewRequest, readPreviewOptions } from "./previewOptions";
import { usePreviewDrawing } from "./usePreviewDrawing";
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
  aiDraftPath: string;
  /** POST endpoint of «Превью с ИИ»; without it (or without AI) there's no such button. */
  aiPreviewPath?: string;
  aiFormEnabled: boolean;
  /** localStorage key for the unsaved draft and remembered values. */
  draftKey?: string;
  onSubmit: (payload: ProductPayload, imageSelection: ProductImageSelection) => void;
}

type AiField = "title" | "description" | "category" | "price" | "sizes" | "colors";

/** How the card gets filled. The AI ones are there only when the store has AI. */
type FillMode = "manual" | "assisted" | "auto";

const fillModes: { value: FillMode; label: string; icon: typeof Edit02Icon; hint: string }[] = [
  { value: "manual", label: "Вручную", icon: Edit02Icon, hint: "Все поля заполняете сами." },
  {
    value: "assisted",
    label: "Вручную + ИИ",
    icon: AiEditingIcon,
    hint: "Заполняете сами, а название, описание, категорию или цвета можно доверить ИИ — кнопка «Заполнить с ИИ» у поля."
  },
  {
    value: "auto",
    label: "Авто",
    icon: AiMagicIcon,
    hint: "Загрузите фото и нажмите «Сгенерировать карточку» — ИИ заполнит всё сам. Останется проверить и указать цену."
  }
];

/** For the toast when the AI came back empty: «ИИ не смог определить …». */
const fieldNames: Record<AiDraftField, string> = { title: "название", description: "описание", category: "категорию", colors: "цвета" };
/** For the screen reader: «Заполнить с ИИ: Категория». */
const fieldTitles: Record<AiDraftField, string> = { title: "Название", description: "Описание", category: "Категория", colors: "Цвета" };

const FILL_MODE_KEY = "product-form-fill-mode";

function savedFillMode(): FillMode {
  try {
    const saved = localStorage.getItem(FILL_MODE_KEY);
    return saved === "assisted" || saved === "auto" ? saved : "manual";
  } catch {
    return "manual";
  }
}

function rememberFillMode(mode: FillMode) {
  try {
    localStorage.setItem(FILL_MODE_KEY, mode);
  } catch {
    // Private mode: the next product just starts by hand.
  }
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

export function ProductForm({ initial, aiDraftPath, aiPreviewPath, aiFormEnabled, draftKey, onSubmit }: ProductFormProps) {
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
  // A new product opens in the way the owner filled the last one; an existing one — by hand.
  const [preferredFillMode, setPreferredFillMode] = useState<FillMode>(() => (initial ? "manual" : savedFillMode()));
  const fillMode: FillMode = aiFormEnabled ? preferredFillMode : "manual";
  // «Авто»: the card was generated (or restored), so the fields are shown instead of the panel.
  const [isAutoDone, setIsAutoDone] = useState(Boolean(savedDraft));
  const [isGenerating, setIsGenerating] = useState(false);
  const [fillingField, setFillingField] = useState<AiDraftField | null>(null);
  const [aiFilled, setAiFilled] = useState<Set<AiField>>(new Set());
  const [isDraftNoticeVisible, setIsDraftNoticeVisible] = useState(Boolean(savedDraft));
  const [mode, setMode] = useState<DetailsMode>(savedDraft?.mode ?? (initialSimple ? "simple" : "advanced"));
  const [simple, setSimple] = useState<SimpleDetailsValue>(savedDraft?.simple ?? initialSimple ?? emptySimpleDetails);
  const [isSimplifyConfirmOpen, setIsSimplifyConfirmOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isReplaceConfirmOpen, setIsReplaceConfirmOpen] = useState(false);
  const [isNoPhotosConfirmOpen, setIsNoPhotosConfirmOpen] = useState(false);
  const imageManager = useImageManager(initial);
  const previewDrawing = usePreviewDrawing(aiPreviewPath ?? null, isPreviewOpen, imageManager.addCover);
  const hasSubmittedRef = useRef(false);
  const photosRef = useRef<HTMLDivElement>(null);
  const builder = useVariantBuilder(initial, savedDraft, draftKey);
  const { variants } = builder;

  // A finished preview is already the cover: the window opens to show it.
  useEffect(() => {
    if (previewDrawing.results.length) setIsPreviewOpen(true);
  }, [previewDrawing.results.length]);

  useEffect(() => {
    if (!draftKey) return;
    const draft: SavedProductFormDraft = { form, variants, mode, simple };
    if (!hasDraftContent(draft)) {
      localStorage.removeItem(draftKey);
      return;
    }
    localStorage.setItem(draftKey, JSON.stringify(draft));
  }, [draftKey, form, variants, mode, simple]);

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
      // What the AI couldn't tell (the price and sizes are rarely on a photo) keeps the owner's value.
      setSimple((current) => ({
        price: draftSimple.price || current.price,
        sizes: draftSimple.sizes.length ? draftSimple.sizes : current.sizes,
        colors: draftSimple.colors.length ? draftSimple.colors : current.colors
      }));
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
    setIsAutoDone(true);
    const isDrawingPreview = drawAutoPreview(draft);
    const noPrice = !draftSimple?.price && !simple.price.trim();
    toast.show(
      `ИИ заполнил форму. Проверьте поля с пометкой «ИИ»${noPrice ? " и укажите цену" : ""}.${isDrawingPreview ? " Превью рисуется — через минуту оно само станет обложкой." : ""}`,
      { tone: "success", duration: 6000 }
    );
  }

  /**
   * «Авто» also draws the preview: from the cover, in the look chosen last
   * time, with what the AI just called the product. Once per form — a card
   * generated again keeps its preview («Посмотреть превью» draws another).
   */
  function drawAutoPreview(draft: ProductDraft) {
    const photo = imageManager.previewImage;
    if (!aiPreviewPath || !photo || previewDrawing.isDrawing || previewDrawing.results.length) return false;
    const product = { title: draft.title ?? form.title, category: draft.category ?? form.category, colors: (draft.colors ?? []).map((color) => color.name) };
    void previewDrawing.draw(previewRequest(photo, readPreviewOptions(), product), photo.id);
    return true;
  }

  // Something the owner typed would be replaced: ask first.
  const hasOwnerDetails = Boolean(
    form.title.trim() ||
      form.description.trim() ||
      form.category.trim() ||
      simple.sizes.length ||
      simple.colors.length ||
      (mode === "advanced" && variants.some((variant) => variant.colorName.trim() || variant.size.trim()))
  );

  function changeFillMode(next: FillMode) {
    setPreferredFillMode(next);
    if (!initial) rememberFillMode(next);
    // In «Авто» a filled card stays on screen; an empty one shows the panel.
    if (next === "auto") setIsAutoDone(isAutoDone || hasOwnerDetails);
  }

  /** «Авто» → «Сгенерировать карточку» (or «Сгенерировать заново» over a filled card). */
  function askToGenerate() {
    if (hasOwnerDetails) setIsReplaceConfirmOpen(true);
    else void generateCard();
  }

  async function generateCard() {
    setIsReplaceConfirmOpen(false);
    setIsGenerating(true);
    try {
      applyDraft(await requestAiDraft(aiDraftPath, { images: imageManager.images, coverId: imageManager.previewImageId }));
    } catch (err: any) {
      toast.show(err.response?.data?.message ?? "Не удалось сгенерировать карточку. Проверьте интернет и попробуйте ещё раз.", { tone: "danger", duration: 6000 });
    } finally {
      setIsGenerating(false);
    }
  }

  /** «Вручную + ИИ»: one field from the photos and what the owner already typed. */
  async function fillField(field: AiDraftField) {
    const known = { title: form.title, description: form.description, category: form.category };
    const hasOtherText = (Object.keys(known) as (keyof typeof known)[]).some((key) => key !== field && known[key].trim());
    if (!imageManager.images.length && !hasOtherText) {
      toast.show("Сначала добавьте фото товара — по нему ИИ заполнит поле");
      return;
    }
    setFillingField(field);
    try {
      const draft = await requestAiDraft(aiDraftPath, { images: imageManager.images, coverId: imageManager.previewImageId, field, known });
      if (!applyField(field, draft)) toast.show(`ИИ не смог определить ${fieldNames[field]}. Попробуйте другое фото или заполните сами.`);
    } catch (err: any) {
      toast.show(err.response?.data?.message ?? "Не удалось заполнить поле. Проверьте интернет и попробуйте ещё раз.", { tone: "danger", duration: 6000 });
    } finally {
      setFillingField(null);
    }
  }

  /** Takes only the asked field from the AI's answer. False — it came back empty. */
  function applyField(field: AiDraftField, draft: ProductDraft) {
    if (field === "colors") {
      const colors = simpleFromDraft({ ...draft, variants: [] })?.colors ?? [];
      if (!colors.length) return false;
      setSimple((current) => ({ ...current, colors }));
    } else {
      const value = draft[field]?.trim();
      if (!value) return false;
      setForm((current) => ({ ...current, [field]: value }));
    }
    setAiFilled((current) => new Set(current).add(field));
    return true;
  }

  const aiAction = (field: AiDraftField) =>
    fillMode === "assisted" ? (
      <AiFieldButton
        fieldName={fieldTitles[field]}
        filled={aiFilled.has(field)}
        loading={fillingField === field}
        disabled={fillingField !== null && fillingField !== field}
        onClick={() => void fillField(field)}
      />
    ) : undefined;

  function advancedPayload() {
    const normalizedVariants = variants
      .map((variant) => ({
        colorName: variant.colorName.trim(),
        colorHex: variant.colorHex.trim() || null,
        size: variant.size.trim(),
        price: variant.price && variant.price !== ASK_SELLER ? parsePrice(variant.price) : null
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

  // A product needs at least one photo; without one the owner is asked and may still save it.
  // An existing product that never had photos isn't asked about on every edit.
  const needsPhotosConfirm = imageManager.images.length === 0 && (!initial || initial.images.length > 0);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (hasSubmittedRef.current) return;
    if (mode === "simple" && !isValidPrice(simple.price)) {
      toast.show(`Цена: ${PRICE_ERROR.toLowerCase()}`, { tone: "danger" });
      return;
    }
    if (needsPhotosConfirm) {
      setIsNoPhotosConfirmOpen(true);
      return;
    }
    save();
  }

  function addPhotosFirst() {
    setIsNoPhotosConfirmOpen(false);
    photosRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function save() {
    if (hasSubmittedRef.current) return;
    setIsNoPhotosConfirmOpen(false);
    hasSubmittedRef.current = true;
    const picture = previewDrawing.pendingPicture();
    // A preview drawn before the one still drawing would make way for it in the form; the save does the same.
    const replaces = imageManager.images.some((image) => image.id === previewDrawing.coverImageId) ? previewDrawing.coverImageId : null;

    onSubmit(
      {
        title: form.title,
        description: form.description || null,
        category: form.category || null,
        status: form.status as ProductStatus,
        isVisible: Number(form.isVisible),
        ...(mode === "simple" ? simplePayload(simple) : advancedPayload())
      },
      { images: imageManager.images, previewImageId: imageManager.previewImageId, pendingPreview: picture ? { picture, replaces } : undefined }
    );
    clearSavedDraft();
  }

  const isVisible = Boolean(form.isVisible);
  // «Авто» shows the fields once the card is generated; the other modes — always.
  const showFields = fillMode !== "auto" || isAutoDone;
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
        <div className={styles.fillModes}>
          <SegmentedControl
            label="Способ заполнения"
            value={fillMode}
            onChange={changeFillMode}
            options={fillModes.map(({ value, label, icon }) => ({ value, label, icon }))}
            className={styles.fillModeSwitch}
          />
          <p className={styles.hint}>{fillModes.find((item) => item.value === fillMode)?.hint}</p>
        </div>
      ) : (
        <Notice icon={LockKeyIcon} title="ИИ недоступен">
          Администратор ещё не подключил заполнение с помощью ИИ для этого магазина.
        </Notice>
      )}

      {showFields && fillMode === "auto" && (
        <Notice
          tone={aiFilled.size ? "success" : "accent"}
          action={
            <Button variant="ghost" size="sm" icon={AiMagicIcon} loading={isGenerating} disabled={!imageManager.images.length} onClick={askToGenerate}>
              {aiFilled.size ? "Сгенерировать заново" : "Сгенерировать"}
            </Button>
          }
        >
          {aiFilled.size ? "ИИ заполнил карточку — проверьте поля с пометкой «ИИ»." : "Карточка уже заполнена. ИИ может заполнить её заново по фото."}
        </Notice>
      )}

      <div ref={photosRef}>
        <ImageManager
          manager={imageManager}
          // In «Авто» the AI draws the preview with the card: the button appears with the card, for a variant of the owner's own.
          onCreatePreview={aiPreviewPath && showFields ? () => setIsPreviewOpen(true) : undefined}
          previewLabel={
            previewDrawing.isDrawing
              ? `Рисуем превью… ${previewDrawing.seconds} с`
              : fillMode === "auto"
                ? "Свой вариант превью"
                : previewDrawing.results.length
                  ? "Посмотреть превью"
                  : undefined
          }
        />
      </div>

      {!showFields && (
        <AutoPanel hasPhotos={imageManager.images.length > 0} withPreview={Boolean(aiPreviewPath)} isGenerating={isGenerating} onGenerate={askToGenerate} />
      )}

      {showFields && (
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
              action={aiAction("title")}
            >
              <Input value={form.title} onChange={(e) => updateForm({ title: e.target.value })} placeholder="Например, льняное платье" required />
            </Field>
            <Field
              label={
                <>
                  Описание <AiBadge show={aiFilled.has("description")} />
                </>
              }
              action={aiAction("description")}
            >
              <Textarea value={form.description} onChange={(e) => updateForm({ description: e.target.value })} placeholder="Ткань, посадка, уход" />
            </Field>
            <Field
              label={
                <>
                  Категория <AiBadge show={aiFilled.has("category")} />
                </>
              }
              action={aiAction("category")}
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
            <SimpleDetails value={simple} onChange={updateSimple} aiFilled={aiFilled} colorsAction={aiAction("colors")} onSwitchToAdvanced={switchToAdvanced} />
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

          {previewDrawing.isDrawing && (
            <Notice tone="accent" icon={AiMagicIcon}>
              Превью ещё рисуется. Можно сохранять: оно дорисуется в фоне и само станет обложкой товара.
            </Notice>
          )}
          <Button type="submit" variant="primary" size="lg" block>
            {submitLabel}
          </Button>
        </>
      )}
      <VariantModal builder={builder} images={imageManager.images} />
      {isPreviewOpen && aiPreviewPath && (
        <PreviewGenerator
          drawing={previewDrawing}
          images={imageManager.images}
          coverId={imageManager.previewImageId}
          product={{
            title: form.title,
            category: form.category,
            colors: mode === "simple" ? simple.colors.map((color) => color.name) : variants.map((variant) => variant.colorName).filter((name) => name !== ASK_SELLER)
          }}
          onClose={() => setIsPreviewOpen(false)}
        />
      )}
      {isReplaceConfirmOpen && (
        <ConfirmModal
          title="Заполнить карточку заново?"
          description="ИИ заменит название, описание, категорию, цвета и размеры тем, что увидит на фото. Цена останется вашей, если ИИ её не найдёт."
          confirmLabel="Сгенерировать"
          onCancel={() => setIsReplaceConfirmOpen(false)}
          onConfirm={generateCard}
        />
      )}
      {isNoPhotosConfirmOpen && (
        <ConfirmModal
          title={initial ? "Сохранить товар без фото?" : "Создать товар без фото?"}
          description={`${initial ? "Вы убрали все фото." : "Вы не добавили ни одного фото."} ${
            isVisible ? "На витрине вместо фото будет пустая карточка" : "Если потом показать товар на витрине, вместо фото будет пустая карточка"
          }, а без фото покупатели почти не открывают товар. Фото можно добавить и позже, в «Редактировать».`}
          confirmLabel={initial ? "Сохранить без фото" : "Создать без фото"}
          cancelLabel="Добавить фото"
          onCancel={addPhotosFirst}
          onConfirm={save}
        />
      )}
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
