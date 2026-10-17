import { AiMagicIcon, Camera01Icon, Cancel01Icon, ImageAdd01Icon } from "@hugeicons/core-free-icons";
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

  /** A picture drawn by «Превью с ИИ»: added to the photos and made the cover. */
  function addCover(file: File, livingBeings: string[] = []) {
    const image = { id: createId(), existingId: null, file, name: file.name, url: URL.createObjectURL(file), livingBeings };
    setImages((current) => [...current, image]);
    setPreviewImageId(image.id);
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
 * «Фото товара»: take or pick photos, choose the cover, remove extras.
 * `onCreatePreview` — the store has AI: «Превью с ИИ»; `previewLabel` says how
 * the drawing goes, `previewReady` — a finished picture waits to be seen.
 */
export function ImageManager({
  manager,
  onCreatePreview,
  previewLabel = "Сделать превью с ИИ",
  previewReady = false
}: {
  manager: ImageManagerState;
  onCreatePreview?: () => void;
  previewLabel?: string;
  previewReady?: boolean;
}) {
  const { images, previewImage, setPreviewImageId, addImages, removeImage } = manager;

  return (
    <Card as="section" className={styles.section}>
      <CardHeader title="Фото товара" description="Первое фото — обложка на витрине. Нажмите на фото, чтобы сделать его обложкой." />
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
          </div>
          <div className={styles.imageGrid}>
            {images.map((image) => (
              <div className={styles.imageThumb} key={image.id}>
                <button
                  type="button"
                  className={cx(styles.imageThumbButton, image.id === previewImage.id && styles.imageThumbActive)}
                  aria-label={`Выбрать ${image.name} как превью`}
                  aria-pressed={image.id === previewImage.id}
                  onClick={() => setPreviewImageId(image.id)}
                >
                  <ProductPhoto src={image.url} sizes="96px" />
                </button>
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
          </div>
          {images.some((image) => image.moderation && image.moderation.status !== "APPROVED") && (
            <Notice tone="warning" title="Покупатели не видят часть фото">
              На них {images
                .filter((image) => image.moderation && image.moderation.status !== "APPROVED")
                .map((image) => image.moderation!.findings)
                .join("; ")}
              . На витрине нельзя показывать людей и животных: такие фото проверяет администратор. «Скрыто» — фото не прошло проверку, его лучше удалить.
            </Notice>
          )}
          {onCreatePreview && (
            <Button variant={previewReady ? "primary" : "secondary"} icon={AiMagicIcon} block onClick={onCreatePreview}>
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
