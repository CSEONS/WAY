import { Add01Icon, ColorPickerIcon } from "@hugeicons/core-free-icons";
import { FormEvent, useState, type ReactNode } from "react";
import { Button, Chip, ChipGroup, ColorSwatch, Field, Input, Modal, SectionLabel, SegmentedControl, cx } from "../../ui";
import { sortSizes } from "../../utils/format";
import { normalizeHex, normalizeSize } from "./helpers";
import { LETTER_SIZES, NAMED_COLORS, NUMBER_SIZES } from "./simple";
import styles from "./ProductForm.module.css";

// Sizes and colors as chips — the same in the product form and in bulk adding.

export interface PickedColor {
  name: string;
  hex: string;
}

const isNumericSize = (size: string) => /^\d+$/.test(size);

const eyeDropperSupported = typeof window !== "undefined" && "EyeDropper" in window;

/** The color under the cursor (Chrome on a computer); null if the owner cancelled. */
async function pickColorFromScreen() {
  const EyeDropperCtor = (window as any).EyeDropper;
  if (!EyeDropperCtor) return null;
  try {
    const result = await new EyeDropperCtor().open();
    return result?.sRGBHex ? normalizeHex(result.sRGBHex) : null;
  } catch {
    return null;
  }
}

interface SizePickerProps {
  value: string[];
  /** Updater form, so quick taps in a row never overwrite each other. */
  onChange: (update: (current: string[]) => string[]) => void;
  label?: ReactNode;
  className?: string;
}

/** «Размеры»: XS–XXL or 40–56 to tap, and the owner's own. */
export function SizePicker({ value, onChange, label = "Размеры", className }: SizePickerProps) {
  const [sizeKind, setSizeKind] = useState<"letters" | "numbers">(() => (value.some(isNumericSize) ? "numbers" : "letters"));
  const [isAdding, setIsAdding] = useState(false);
  const [customSize, setCustomSize] = useState("");
  const presets = sizeKind === "letters" ? LETTER_SIZES : NUMBER_SIZES;
  const chips = [...presets, ...value.filter((size) => !presets.includes(size))];

  function toggle(size: string) {
    onChange((current) => sortSizes(current.includes(size) ? current.filter((item) => item !== size) : [...current, size]));
  }

  function addCustom(event: FormEvent) {
    event.preventDefault();
    const size = /^[a-z]+$/i.test(customSize.trim()) ? normalizeSize(customSize) : customSize.trim();
    if (size) onChange((current) => (current.includes(size) ? current : sortSizes([...current, size])));
    setCustomSize("");
    setIsAdding(false);
  }

  return (
    <div className={cx(styles.builderBlock, className)}>
      <div className={styles.blockHead}>
        <SectionLabel>{label}</SectionLabel>
        <SegmentedControl
          label="Какие размеры показывать"
          size="sm"
          value={sizeKind}
          onChange={setSizeKind}
          options={[
            { value: "letters", label: "XS–XXL" },
            { value: "numbers", label: "40–56" }
          ]}
        />
      </div>
      <ChipGroup label="Размеры">
        {chips.map((size) => (
          <Chip key={size} className={styles.sizeChip} selected={value.includes(size)} onClick={() => toggle(size)}>
            {size}
          </Chip>
        ))}
        <Chip dashed icon={Add01Icon} onClick={() => setIsAdding(true)}>
          Свой размер
        </Chip>
      </ChipGroup>

      {isAdding && (
        <Modal
          size="sm"
          title="Свой размер"
          onClose={() => setIsAdding(false)}
          onSubmit={addCustom}
          footer={
            <Button type="submit" variant="primary">
              Добавить
            </Button>
          }
        >
          <Field label="Размер" hint="Например: 38, 3XL, Единый">
            <Input value={customSize} onChange={(event) => setCustomSize(event.target.value)} />
          </Field>
        </Modal>
      )}
    </div>
  );
}

interface ColorPickerProps {
  value: PickedColor[];
  /** Updater form, so quick taps in a row never overwrite each other. */
  onChange: (update: (current: PickedColor[]) => PickedColor[]) => void;
  label?: ReactNode;
  /** «Вручную + ИИ»: «Заполнить с ИИ» on the label's line. */
  action?: ReactNode;
  /** The cover photo: the eyedropper takes a color from it. */
  coverUrl?: string;
  className?: string;
}

const NEW_COLOR: PickedColor = { name: "", hex: "#94A3B8" };

/**
 * «Цвета»: a swatch for every color — the usual ones to tap, the ones the AI
 * or the owner named next to them. A product may have several.
 */
export function ColorPicker({ value, onChange, label = "Цвета", action, coverUrl, className }: ColorPickerProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [customColor, setCustomColor] = useState(NEW_COLOR);
  const chips = [...NAMED_COLORS, ...value.filter((color) => !NAMED_COLORS.some((named) => named.name === color.name))];
  const canPipette = eyeDropperSupported && Boolean(coverUrl);

  function toggle(color: PickedColor) {
    onChange((current) => (current.some((item) => item.name === color.name) ? current.filter((item) => item.name !== color.name) : [...current, color]));
  }

  function addCustom(event: FormEvent) {
    event.preventDefault();
    const name = customColor.name.trim();
    const hex = customColor.hex;
    if (name) onChange((current) => (current.some((color) => color.name.toLowerCase() === name.toLowerCase()) ? current : [...current, { name, hex }]));
    setCustomColor(NEW_COLOR);
    setIsAdding(false);
  }

  return (
    <div className={cx(styles.builderBlock, className)}>
      <div className={styles.blockHead}>
        <SectionLabel>{label}</SectionLabel>
        {action}
      </div>
      <ChipGroup label="Цвета">
        {chips.map((color) => (
          <Chip key={color.name} selected={value.some((item) => item.name === color.name)} onClick={() => toggle(color)}>
            <ColorSwatch color={color.hex} size="sm" />
            {color.name}
          </Chip>
        ))}
        <Chip dashed icon={Add01Icon} onClick={() => setIsAdding(true)}>
          Другой цвет
        </Chip>
      </ChipGroup>

      {isAdding && (
        <Modal
          size="sm"
          title="Другой цвет"
          onClose={() => setIsAdding(false)}
          onSubmit={addCustom}
          footer={
            <Button type="submit" variant="primary">
              Добавить
            </Button>
          }
        >
          <Field label="Название цвета" hint="Так цвет увидят покупатели, например «Мятный»">
            <Input value={customColor.name} onChange={(event) => setCustomColor({ ...customColor, name: event.target.value })} required />
          </Field>
          <div className={styles.colorTools}>
            <input
              type="color"
              className={styles.nativeColor}
              aria-label="Оттенок"
              value={customColor.hex}
              onChange={(event) => setCustomColor({ ...customColor, hex: event.target.value })}
            />
            {canPipette && (
              <Button
                variant="secondary"
                size="sm"
                icon={ColorPickerIcon}
                onClick={async () => {
                  const hex = await pickColorFromScreen();
                  if (hex) setCustomColor((current) => ({ ...current, hex }));
                }}
              >
                Пипетка
              </Button>
            )}
            <span className={styles.hint}>{canPipette ? "Оттенок — на палитре или пипеткой с фото" : "Выберите оттенок на палитре"}</span>
          </div>
          {canPipette && (
            <div className={styles.pipettePreview}>
              <img src={coverUrl} alt="Фото товара для пипетки" />
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
