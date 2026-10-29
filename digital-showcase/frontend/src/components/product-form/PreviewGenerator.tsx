import { AiMagicIcon, PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { useEffect, useRef, useState } from "react";
import { Button, Checkbox, Chip, ChipGroup, ColorSwatch, Field, Input, Modal, Notice, SectionLabel, SegmentedControl, cx, useToast } from "../../ui";
import { ProductPhoto } from "../ProductPhoto";
import {
  FEATURES,
  MAX_FEATURES,
  MAX_HEADLINE,
  SCENES,
  THEMES,
  previewRequest,
  readPreviewOptions,
  savePreviewOptions,
  type PreviewFeature,
  type PreviewOptions
} from "./previewOptions";
import type { ProductFormImage } from "./types";
import type { PreviewDrawing } from "./usePreviewDrawing";
import styles from "./PreviewGenerator.module.css";

interface PreviewGeneratorProps {
  /** The drawing itself lives in the form (usePreviewDrawing), so this window can be closed while it runs. */
  drawing: PreviewDrawing;
  images: ProductFormImage[];
  /** The current cover: the photo to draw from by default, and a drawn picture once it's ready. */
  coverId: string | null;
  product: { title: string; category: string; colors: { name: string; hex: string }[] };
  onClose: () => void;
}

/**
 * «Превью с ИИ»: the product photo becomes a storefront cover — a nicer scene
 * and, if wanted, a headline, a badge and benefit icons. Based on the
 * «Генератор карточек товара» template (its simple mode); the server builds
 * the prompt and calls the image model. A finished picture is the cover at
 * once (usePreviewDrawing): the window just shows it.
 */
export function PreviewGenerator({ drawing, images, coverId, product, onClose }: PreviewGeneratorProps) {
  const toast = useToast();
  const { results, selected, isDrawing, seconds, error } = drawing;
  // A drawn cover isn't drawn from again: only the product's own photos.
  const sources = images.filter((image) => image.id !== drawing.coverImageId);
  const [photoId, setPhotoId] = useState(
    () => [drawing.sourcePhotoId, coverId].find((id) => sources.some((image) => image.id === id)) ?? sources[0]?.id ?? null
  );
  const [options, setOptions] = useState<PreviewOptions>(readPreviewOptions);
  const [isHeadlineOpen, setIsHeadlineOpen] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const photo = sources.find((image) => image.id === photoId);
  const colors = [...new Set(product.colors.map((color) => color.name.trim()).filter(Boolean))];
  const chosen = results[selected];
  // The owner may have picked another photo as the cover or removed the picture since.
  const isCover = Boolean(chosen) && drawing.coverImageId === coverId;
  const withText = options.text === "with_text";

  // A new picture shows up at the top of the window.
  useEffect(() => {
    if (results.length) resultRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [results.length]);

  function choose(index: number) {
    if (index !== selected || !isCover) drawing.chooseResult(results[index], index);
  }

  function update(patch: Partial<PreviewOptions>) {
    setOptions((current) => ({ ...current, ...patch }));
  }

  function toggleFeature(feature: PreviewFeature) {
    setOptions((current) => {
      if (current.features.includes(feature)) return { ...current, features: current.features.filter((item) => item !== feature) };
      if (current.features.length >= MAX_FEATURES) return current;
      return { ...current, features: [...current.features, feature] };
    });
  }

  function draw() {
    if (!photo) return;
    savePreviewOptions(options);
    void drawing.draw(previewRequest(photo, options, product), photo.id);
    // The request is on its way: the window folds away, the owner keeps filling in the product.
    // When the picture is ready, it becomes the cover and the form opens this window again to show it.
    toast.show("Рисуем превью — через минуту оно само станет обложкой. Можно заполнять товар дальше", { duration: 5000 });
    onClose();
  }

  const drawLabel = isDrawing ? `Рисуем… ${seconds} с` : results.length ? "Нарисовать ещё" : "Нарисовать превью";

  return (
    <Modal
      size="md"
      icon={AiMagicIcon}
      title="Превью с ИИ"
      description="ИИ нарисует обложку для витрины по фото товара: красивый фон, а если хотите — заголовок и преимущества. Сам товар останется как на фото."
      onClose={onClose}
      closeOnBackdrop={false}
      footer={
        results.length ? (
          <>
            <Button variant="secondary" loading={isDrawing} disabled={!photo} onClick={draw}>
              {drawLabel}
            </Button>
            {isCover ? (
              <Button variant="primary" onClick={onClose}>
                Готово
              </Button>
            ) : (
              <Button variant="primary" disabled={isDrawing || !chosen} onClick={() => choose(selected)}>
                Сделать обложкой
              </Button>
            )}
          </>
        ) : (
          <>
            <Button variant="neutral" onClick={onClose}>
              {isDrawing ? "Закрыть" : "Отмена"}
            </Button>
            <Button variant="primary" icon={AiMagicIcon} loading={isDrawing} disabled={!photo} onClick={draw}>
              {drawLabel}
            </Button>
          </>
        )
      }
    >
      {chosen && (
        <div className={styles.result} ref={resultRef}>
          <img className={styles.resultImage} src={chosen.url} alt="Превью, нарисованное ИИ" />
          {results.length > 1 && (
            <div className={styles.variants} role="group" aria-label="Варианты">
              {results.map((result, index) => (
                <button
                  type="button"
                  key={result.url}
                  className={cx(styles.variant, index === selected && styles.variantActive)}
                  aria-label={`Вариант ${index + 1}`}
                  aria-pressed={index === selected}
                  onClick={() => choose(index)}
                >
                  <img src={result.url} alt="" />
                </button>
              ))}
            </div>
          )}
          {chosen.livingBeings.length > 0 && (
            <Notice tone="warning" title="Подозрение на нарушение правил площадки">
              Товар будет отправлен на проверку администратору. Если выявится нарушение правил, товар будет отозван.
            </Notice>
          )}
          <p className={styles.hint}>
            {isCover
              ? "Превью уже стоит обложкой товара. Не нравится — поменяйте настройки ниже и нарисуйте ещё: новое займёт его место."
              : "Сейчас обложка — другое фото. Чтобы вернуть это превью, нажмите «Сделать обложкой»."}
          </p>
        </div>
      )}

      {isDrawing && (
        <Notice tone="accent" icon={AiMagicIcon}>
          Рисуем превью — обычно это до минуты. Окно можно закрыть и заполнять товар дальше: готовое превью само станет обложкой, а окно откроется и покажет его.
        </Notice>
      )}
      {error && <Notice tone="danger">{error}</Notice>}

      {sources.length > 1 && (
        <div className={styles.group}>
          <SectionLabel>С какого фото рисовать</SectionLabel>
          <div className={styles.photos} role="group" aria-label="Фото товара">
            {sources.map((image, index) => (
              <button
                type="button"
                key={image.id}
                className={cx(styles.photo, image.id === photoId && styles.photoActive)}
                aria-label={`Фото ${index + 1}`}
                aria-pressed={image.id === photoId}
                onClick={() => setPhotoId(image.id)}
              >
                <ProductPhoto src={image.url} sizes="64px" />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={styles.group}>
        <SectionLabel>Фон</SectionLabel>
        <ChipGroup label="Фон">
          {SCENES.map((scene) => (
            <Chip key={scene.value} selected={options.scene === scene.value} onClick={() => update({ scene: scene.value })}>
              {scene.label}
            </Chip>
          ))}
        </ChipGroup>
      </div>

      <div className={styles.group}>
        <SectionLabel>Цвета оформления</SectionLabel>
        <ChipGroup label="Цвета оформления">
          {THEMES.map((theme) => (
            <Chip key={theme.value} selected={options.theme === theme.value} onClick={() => update({ theme: theme.value })}>
              {theme.colors && (
                <span className={styles.swatches} aria-hidden="true">
                  <ColorSwatch color={theme.colors[0]} size="sm" />
                  <ColorSwatch color={theme.colors[1]} size="sm" />
                </span>
              )}
              {theme.label}
            </Chip>
          ))}
        </ChipGroup>
      </div>

      <SegmentedControl
        label="Надписи на превью"
        value={options.text}
        onChange={(text) => update({ text })}
        options={[
          { value: "with_text", label: "С надписями" },
          { value: "no_text", label: "Без надписей" }
        ]}
      />

      {withText && (
        <>
          <div className={styles.group}>
            <SectionLabel>
              Преимущества · {options.features.length ? `${options.features.length} из ${MAX_FEATURES}` : "подберёт ИИ"}
            </SectionLabel>
            <ChipGroup label="Преимущества">
              <Chip selected={!options.features.length} dashed onClick={() => update({ features: [] })}>
                Авто
              </Chip>
              {FEATURES.map((feature) => {
                const isOn = options.features.includes(feature.value);
                return (
                  <Chip
                    key={feature.value}
                    selected={isOn}
                    disabled={!isOn && options.features.length >= MAX_FEATURES}
                    onClick={() => toggleFeature(feature.value)}
                  >
                    {feature.label}
                  </Chip>
                );
              })}
            </ChipGroup>
            <span className={styles.hint}>Каждое станет иконкой с подписью.</span>
          </div>

          {isHeadlineOpen || options.headline ? (
            <Field label="Заголовок" hint="Пусто — ИИ придумает сам.">
              <Input value={options.headline} maxLength={MAX_HEADLINE} onChange={(event) => update({ headline: event.target.value })} placeholder="Например, ЗИМНЯЯ КУРТКА" autoFocus />
            </Field>
          ) : (
            <Button variant="ghost" size="sm" icon={PencilEdit02Icon} className={styles.headlineToggle} onClick={() => setIsHeadlineOpen(true)}>
              Свой заголовок вместо придуманного ИИ
            </Button>
          )}
        </>
      )}

      {colors.length > 0 && (
        <Checkbox
          checked={options.colorDots}
          onChange={(colorDots) => update({ colorDots })}
          label={
            <span className={styles.dotsLabel}>
              Кружки с цветами товара в углу
              <span className={styles.dots} aria-hidden="true">
                {product.colors.slice(0, 8).map((color) => (
                  <ColorSwatch key={color.name} color={color.hex} size="sm" />
                ))}
              </span>
            </span>
          }
        />
      )}
      {colors.length > 1 && (
        <Checkbox checked={options.showColors} onChange={(showColors) => update({ showColors })} label={`Показать все цвета: ${colors.join(", ").toLowerCase()}`} />
      )}

      <p className={styles.note}>Каждая попытка расходует лимит ИИ магазина, как карточка товара.</p>
    </Modal>
  );
}
