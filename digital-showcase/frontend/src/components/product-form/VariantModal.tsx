import { ColorPickerIcon } from "@hugeicons/core-free-icons";
import type { FormEvent } from "react";
import { Button, Chip, ChipGroup, ColorSwatch, Field, Input, Modal, SectionLabel, cx } from "../../ui";
import { COLOR_PRESETS, formatPrice, isValidHex, normalizeHex } from "./helpers";
import type { ProductFormImage, VariantModalType } from "./types";
import type { VariantBuilderState } from "./useVariantBuilder";
import styles from "./ProductForm.module.css";

const titles: Record<VariantModalType, string> = {
  color: "Новый цвет",
  size: "Новый размер",
  price: "Новая цена",
  "all-colors": "Все цвета",
  "all-sizes": "Все размеры",
  "all-prices": "Все цены"
};

const eyeDropperSupported = typeof window !== "undefined" && "EyeDropper" in window;

async function pickColorFromScreen() {
  const EyeDropperCtor = (window as any).EyeDropper;
  if (!EyeDropperCtor) return null;
  try {
    const result = await new EyeDropperCtor().open();
    return result?.sRGBHex ? normalizeHex(result.sRGBHex) : null;
  } catch {
    // The user cancelled the eyedropper.
    return null;
  }
}

/** Dialogs of the variant builder: add a color/size/price, or browse (and long-press delete) remembered values. */
export function VariantModal({ builder, images }: { builder: VariantBuilderState; images: ProductFormImage[] }) {
  const type = builder.modal;
  if (!type) return null;

  const pipetteImage = images.find((image) => image.id === builder.pipetteImageId) ?? images[0];
  const submit =
    type === "color" ? builder.submitNewColor : type === "size" ? builder.submitNewSize : type === "price" ? builder.submitNewPrice : undefined;
  const isListView = type.startsWith("all-");

  function longPressProps(key: string, onDelete: () => void, onPick: () => void) {
    return {
      className: cx(builder.pressingKey === key && styles.holding),
      onPointerDown: () => builder.beginLongPress(key, onDelete),
      onPointerUp: () =>
        builder.endLongPress(() => {
          onPick();
          builder.closeModal();
        }),
      onPointerLeave: builder.cancelLongPress,
      onContextMenu: (event: { preventDefault: () => void }) => event.preventDefault()
    };
  }

  return (
    <Modal
      size="sm"
      title={titles[type]}
      description={isListView ? "Нажмите значение, чтобы выбрать его. Зажмите — чтобы удалить." : undefined}
      onClose={builder.closeModal}
      onSubmit={
        submit
          ? (event: FormEvent) => {
              event.preventDefault();
              submit();
            }
          : undefined
      }
      footer={
        submit && (
          <Button type="submit" variant="primary">
            Добавить
          </Button>
        )
      }
    >
      {type === "color" && (
        <>
          <div className={styles.colorHead}>
            <span className={styles.colorPreview} style={{ background: normalizeHex(builder.draftColorHex) }} />
            <Field label="Цвет" error={builder.draftColorHex.trim() && !isValidHex(builder.draftColorHex) ? "Введите HEX-код, например 2779A7 или #2779A7" : undefined}>
              <Input
                value={builder.draftColorHex}
                onChange={(e) => builder.setDraftColorHex(e.target.value)}
                onBlur={() => builder.setDraftColorHex(normalizeHex(builder.draftColorHex))}
                placeholder="#2779A7"
                maxLength={7}
              />
            </Field>
          </div>
          <div className={styles.colorTools}>
            <input
              type="color"
              className={styles.nativeColor}
              aria-label="Выбрать цвет на палитре"
              value={normalizeHex(builder.draftColorHex)}
              onChange={(e) => builder.setDraftColorHex(e.target.value)}
            />
            {eyeDropperSupported && (
              <Button
                variant="secondary"
                size="sm"
                icon={ColorPickerIcon}
                disabled={images.length === 0}
                title={images.length === 0 ? "Сначала добавьте картинку товара" : "Взять цвет с картинки товара"}
                onClick={async () => {
                  const hex = await pickColorFromScreen();
                  if (hex) builder.setDraftColorHex(hex);
                }}
              >
                Пипетка
              </Button>
            )}
          </div>
          <div className={styles.builderBlock}>
            <SectionLabel>Быстрый выбор</SectionLabel>
            <ChipGroup label="Быстрый выбор цвета">
              {COLOR_PRESETS.map((preset) => (
                <ColorSwatch
                  key={preset}
                  color={preset}
                  label={`Выбрать цвет ${preset}`}
                  size="lg"
                  selected={normalizeHex(builder.draftColorHex) === preset}
                  onClick={() => builder.setDraftColorHex(preset)}
                />
              ))}
            </ChipGroup>
          </div>
          {eyeDropperSupported && images.length > 0 && (
            <div className={styles.builderBlock}>
              <SectionLabel>Картинка для пипетки</SectionLabel>
              {images.length > 1 && (
                <div className={styles.pipetteGrid}>
                  {images.map((image) => (
                    <button
                      key={image.id}
                      type="button"
                      className={cx(styles.imageThumbButton, image.id === pipetteImage?.id && styles.imageThumbActive)}
                      aria-label={`Использовать ${image.name} для пипетки`}
                      aria-pressed={image.id === pipetteImage?.id}
                      onClick={() => builder.setPipetteImageId(image.id)}
                    >
                      <img src={image.url} alt="" />
                    </button>
                  ))}
                </div>
              )}
              {pipetteImage && (
                <div className={styles.pipettePreview}>
                  <img src={pipetteImage.url} alt={pipetteImage.name} />
                </div>
              )}
            </div>
          )}
        </>
      )}

      {type === "size" && (
        <Field label="Размер">
          <Input value={builder.draftSize} onChange={(e) => builder.setDraftSize(e.target.value)} placeholder="Например, M или 42" autoFocus />
        </Field>
      )}

      {type === "price" && (
        <Field label="Цена">
          <Input type="number" value={builder.draftPrice} onChange={(e) => builder.setDraftPrice(e.target.value)} placeholder="Например, 1990" autoFocus />
        </Field>
      )}

      {type === "all-colors" && (
        <ChipGroup label="Все цвета">
          {builder.colorHistory.map((color) => (
            <ColorSwatch
              key={`${color.name}-${color.hex}-all`}
              color={color.hex}
              label={color.name}
              size="lg"
              {...longPressProps(`color-${color.name}`, () => builder.deleteColor(color.name), () => builder.setSelectedColorName(color.name))}
            />
          ))}
          {!builder.colorHistory.length && <span className={styles.note}>Значений пока нет</span>}
        </ChipGroup>
      )}

      {type === "all-sizes" && (
        <ChipGroup label="Все размеры">
          {builder.sizeHistory.map((size) => (
            <Chip key={`${size}-all`} {...longPressProps(`size-${size}`, () => builder.deleteSize(size), () => builder.setSelectedSize(size))}>
              {size}
            </Chip>
          ))}
          {!builder.sizeHistory.length && <span className={styles.note}>Значений пока нет</span>}
        </ChipGroup>
      )}

      {type === "all-prices" && (
        <ChipGroup label="Все цены">
          {builder.priceHistory.map((price) => (
            <Chip key={`${price}-all`} {...longPressProps(`price-${price}`, () => builder.deletePrice(price), () => builder.setSelectedPrice(price))}>
              {formatPrice(price)}
            </Chip>
          ))}
          {!builder.priceHistory.length && <span className={styles.note}>Значений пока нет</span>}
        </ChipGroup>
      )}
    </Modal>
  );
}
