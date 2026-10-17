import { AiMagicIcon, PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import { Button, Checkbox, Chip, ChipGroup, ColorSwatch, Field, Input, Modal, Notice, SectionLabel, SegmentedControl, cx } from "../../ui";
import { ProductPhoto } from "../ProductPhoto";
import {
  FEATURES,
  MAX_FEATURES,
  MAX_HEADLINE,
  SCENES,
  THEMES,
  dataUrlToFile,
  readPreviewOptions,
  savePreviewOptions,
  type PreviewFeature,
  type PreviewOptions
} from "./previewOptions";
import type { ProductFormImage } from "./types";
import styles from "./PreviewGenerator.module.css";

interface PreviewGeneratorProps {
  /** POST endpoint of the store the product belongs to. */
  path: string;
  images: ProductFormImage[];
  /** The current cover: the photo to draw from by default. */
  coverId: string | null;
  product: { title: string; category: string; colors: string[] };
  /** The owner liked a picture: it becomes the cover. */
  onUse: (file: File) => void;
  onClose: () => void;
}

interface Result {
  file: File;
  url: string;
}

/**
 * «Превью с ИИ»: the product photo becomes a storefront cover — a nicer scene
 * and, if wanted, a headline, a badge and benefit icons. Based on the
 * «Генератор карточек товара» template (its simple mode); the server builds
 * the prompt and calls the image model.
 */
export function PreviewGenerator({ path, images, coverId, product, onUse, onClose }: PreviewGeneratorProps) {
  const [photoId, setPhotoId] = useState(() => (images.some((image) => image.id === coverId) ? coverId : images[0]?.id ?? null));
  const [options, setOptions] = useState<PreviewOptions>(readPreviewOptions);
  const [isHeadlineOpen, setIsHeadlineOpen] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [selected, setSelected] = useState(0);
  const [isDrawing, setIsDrawing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const resultRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef(results);
  const photo = images.find((image) => image.id === photoId);
  const colors = [...new Set(product.colors.map((color) => color.trim()).filter(Boolean))];
  const chosen = results[selected];
  const withText = options.text === "with_text";

  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  useEffect(() => () => resultsRef.current.forEach((result) => URL.revokeObjectURL(result.url)), []);

  // Drawing takes a while: a running count shows it's alive.
  useEffect(() => {
    if (!isDrawing) return;
    const startedAt = Date.now();
    setSeconds(0);
    const timer = window.setInterval(() => setSeconds(Math.round((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [isDrawing]);

  // A new picture shows up at the top of the window.
  useEffect(() => {
    if (results.length) resultRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [results.length]);

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

  async function draw() {
    if (!photo) return;
    setError("");
    setIsDrawing(true);
    savePreviewOptions(options);
    try {
      const formData = new FormData();
      // A new photo goes as a file; a saved one — by its address.
      if (photo.file) formData.append("image", photo.file);
      else formData.append("imageUrl", photo.url);
      formData.append(
        "options",
        JSON.stringify({
          ...options,
          headline: withText ? options.headline.trim() : "",
          showColors: options.showColors && colors.length > 1,
          title: product.title.trim(),
          category: product.category.trim(),
          colors
        })
      );
      const { data } = await api.post<{ image: string }>(path, formData);
      const file = dataUrlToFile(data.image, `ai-preview-${Date.now()}`);
      setSelected(results.length);
      setResults((current) => [...current, { file, url: URL.createObjectURL(file) }]);
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Не удалось нарисовать превью. Проверьте интернет и попробуйте ещё раз.");
    } finally {
      setIsDrawing(false);
    }
  }

  function applyChosen() {
    if (!chosen) return;
    onUse(chosen.file);
    onClose();
  }

  const drawLabel = isDrawing ? `Рисуем… ${seconds} с` : results.length ? "Нарисовать ещё" : "Нарисовать превью";

  return (
    <Modal
      size="md"
      icon={AiMagicIcon}
      title="Превью с ИИ"
      description="ИИ нарисует обложку для витрины по фото товара: красивый фон, а если хотите — заголовок и преимущества. Сам товар останется как на фото."
      onClose={() => {
        if (!isDrawing) onClose();
      }}
      hideCloseButton={isDrawing}
      closeOnBackdrop={false}
      footer={
        results.length ? (
          <>
            <Button variant="secondary" loading={isDrawing} disabled={!photo} onClick={draw}>
              {drawLabel}
            </Button>
            <Button variant="primary" disabled={isDrawing || !chosen} onClick={applyChosen}>
              Сделать обложкой
            </Button>
          </>
        ) : (
          <>
            <Button variant="neutral" disabled={isDrawing} onClick={onClose}>
              Отмена
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
                  onClick={() => setSelected(index)}
                >
                  <img src={result.url} alt="" />
                </button>
              ))}
            </div>
          )}
          <p className={styles.hint}>Нравится — нажмите «Сделать обложкой». Нет — поменяйте настройки ниже и нарисуйте ещё.</p>
        </div>
      )}

      {isDrawing && (
        <Notice tone="accent" icon={AiMagicIcon}>
          Рисуем превью — обычно это до минуты. Не закрывайте окно.
        </Notice>
      )}
      {error && <Notice tone="danger">{error}</Notice>}

      {images.length > 1 && (
        <div className={styles.group}>
          <SectionLabel>С какого фото рисовать</SectionLabel>
          <div className={styles.photos} role="group" aria-label="Фото товара">
            {images.map((image, index) => (
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

      {colors.length > 1 && (
        <Checkbox checked={options.showColors} onChange={(showColors) => update({ showColors })} label={`Показать все цвета: ${colors.join(", ").toLowerCase()}`} />
      )}

      <p className={styles.note}>Каждая попытка расходует лимит ИИ магазина, как карточка товара.</p>
    </Modal>
  );
}
