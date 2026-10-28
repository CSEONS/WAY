import { AiMagicIcon, Camera01Icon, Cancel01Icon, ImageAdd01Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import type { Product } from "../../types/models";
import { compressImages } from "../../utils/compressImage";
import { Badge, Button, Card, CardHeader, FileButton, Icon, Notice, cx } from "../../ui";
import { ProductPhoto } from "../ProductPhoto";
import { createId, initialImages } from "./helpers";
import type { ProductFormImage } from "./types";
import styles from "./ProductForm.module.css";

const ACCEPT = "image/png,image/jpeg,image/webp";

export function useImageManager(initial?: Product) {
  const [images, setImages] = useState<ProductFormImage[]>(() => initialImages(initial));
  const [previewImageId, setPreviewImageId] = useState<string | null>(() => initial?.images[0]?.id ?? null);
  const previewImage = images.find((image) => image.id === previewImageId) ?? images[0];

  async function addImages(selected: File[]) {
    if (!selected.length) return;
    const files = await compressImages(selected);
    const nextImages = files.map((file) => ({ id: createId(), existingId: null, file, name: file.name, url: URL.createObjectURL(file) }));
    setImages((current) => [...current, ...nextImages]);
    setPreviewImageId((current) => current ?? nextImages[0]?.id ?? null);
  }

  /** A picture drawn by «Превью с ИИ» becomes the cover: added to the photos, or in place of `replaceId` (the one drawn before). */
  function addCover(file: File, livingBeings: string[] = [], replaceId: string | null = null) {
    const image = { id: createId(), existingId: null, file, name: file.name, url: URL.createObjectURL(file), livingBeings };
    setImages((current) => {
      const replaced = current.find((item) => item.id === replaceId);
      if (!replaced) return [...current, image];
      URL.revokeObjectURL(replaced.url);
      return current.map((item) => (item === replaced ? image : item));
    });
    setPreviewImageId(image.id);
    return image.id;
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

  return { images, previewImageId, previewImage, setPreviewImageId, addImages, addCover, removeImage };
}

export type ImageManagerState = ReturnType<typeof useImageManager>;

/**
 * «Фото товара»: take or pick photos, choose the cover (a tap on a photo; it's
 * marked «Обложка» and goes first on the storefront), remove extras, add more
 * with the «+» tile after the last photo.
 * `onCreatePreview` — the store has AI: «Превью с ИИ»; `previewLabel` says how
 * the drawing goes.
 */
export function ImageManager({
  manager,
  onCreatePreview,
  previewLabel = "Сделать превью с ИИ"
}: {
  manager: ImageManagerState;
  onCreatePreview?: () => void;
  previewLabel?: string;
}) {
  const { images, previewImage, setPreviewImageId, addImages, removeImage } = manager;

  return (
    <Card as="section" className={styles.section}>
      <CardHeader title="Фото товара" description="Обложку покупатели видят в каталоге. Нажмите на фото, чтобы сделать его обложкой." />
      <div className={styles.photoActions}>
        <FileButton variant="primary" icon={Camera01Icon} accept="image/*" capture="environment" onFiles={addImages}>
          Сфотографировать
        </FileButton>
        <FileButton icon={ImageAdd01Icon} accept={ACCEPT} multiple onFiles={addImages}>
          Из галереи
        </FileButton>
      </div>
      {previewImage ? (
        <>
          <div className={styles.imagePreview}>
            <img src={previewImage.url} alt={previewImage.name} />
            <Badge tone="accent" className={styles.coverLabel}>
              Обложка в каталоге
            </Badge>
          </div>
          <div className={styles.imageGrid}>
            {images.map((image) => (
              <div className={styles.imageThumb} key={image.id}>
                <button
                  type="button"
                  className={cx(styles.imageThumbButton, image.id === previewImage.id && styles.imageThumbActive)}
                  aria-label={`Сделать обложкой ${image.name}`}
                  title={image.id === previewImage.id ? "Обложка" : "Сделать обложкой"}
                  aria-pressed={image.id === previewImage.id}
                  onClick={() => setPreviewImageId(image.id)}
                >
                  <ProductPhoto src={image.url} sizes="96px" />
                </button>
                {image.id === previewImage.id && (
                  <Badge tone="accent" className={styles.coverBadge}>
                    Обложка
                  </Badge>
                )}
                <button type="button" className={styles.imageRemove} aria-label={`Удалить ${image.name}`} title="Удалить" onClick={() => removeImage(image.id)}>
                  <Icon icon={Cancel01Icon} size="xs" strokeWidth={2} />
                </button>
                {image.moderation && image.moderation.status !== "APPROVED" && (
                  <Badge tone={image.moderation.status === "PENDING" ? "warning" : "danger"} className={styles.imageModeration}>
                    {image.moderation.status === "PENDING" ? "Проверка" : "Скрыто"}
                  </Badge>
                )}
              </div>
            ))}
            <label className={styles.imageAdd} title="Добавить фото">
              <Icon icon={PlusSignIcon} size="md" />
              <span className={styles.srOnly}>Добавить фото</span>
              <input
                type="file"
                className={styles.dropzoneInput}
                accept={ACCEPT}
                multiple
                onChange={(event) => {
                  addImages([...(event.target.files ?? [])]);
                  event.target.value = "";
                }}
              />
            </label>
          </div>
          {images.some((image) => image.moderation && image.moderation.status !== "APPROVED") && (
            <Notice tone="warning" title="Подозрение на нарушение правил площадки">
              На фото: {images
                .filter((image) => image.moderation && image.moderation.status !== "APPROVED")
                .map((image) => image.moderation!.findings)
                .join("; ")}
              . На витрине нельзя показывать лица людей и морды животных. Фото с пометкой «Проверка» покупатели пока видят: администратор проверит их и, если
              нарушение подтвердится, скроет фото или весь товар. «Скрыто» — администратор уже скрыл фото. Лучше заменить такие фото другими.
            </Notice>
          )}
          {onCreatePreview && (
            <Button variant="secondary" icon={AiMagicIcon} block onClick={onCreatePreview}>
              {previewLabel}
            </Button>
          )}
        </>
      ) : (
        <label className={styles.dropzone}>
          <Icon icon={ImageAdd01Icon} size="lg" strokeWidth={1.6} />
          Фото ещё не добавлены
          <input
            type="file"
            className={styles.dropzoneInput}
            accept={ACCEPT}
            multiple
            onChange={(event) => {
              addImages([...(event.target.files ?? [])]);
              event.target.value = "";
            }}
          />
        </label>
      )}
    </Card>
  );
}
