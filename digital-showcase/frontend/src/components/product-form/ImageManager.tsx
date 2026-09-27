import { Camera01Icon, Cancel01Icon, ImageAdd01Icon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import type { Product } from "../../types/models";
import { compressImages } from "../../utils/compressImage";
import { Card, CardHeader, FileButton, Icon, cx } from "../../ui";
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

  function removeImage(id: string) {
    setImages((current) => {
      const image = current.find((item) => item.id === id);
      if (image?.file) URL.revokeObjectURL(image.url);
      const nextImages = current.filter((item) => item.id !== id);
      setPreviewImageId((currentPreview) => (currentPreview === id ? nextImages[0]?.id ?? null : currentPreview));
      return nextImages;
    });
  }

  return { images, previewImageId, previewImage, setPreviewImageId, addImages, removeImage };
}

export type ImageManagerState = ReturnType<typeof useImageManager>;

/** «Фото товара»: take or pick photos, choose the cover, remove extras. */
export function ImageManager({ manager }: { manager: ImageManagerState }) {
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
              </div>
            ))}
          </div>
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
