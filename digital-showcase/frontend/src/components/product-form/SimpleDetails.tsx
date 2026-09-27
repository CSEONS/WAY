import { Add01Icon, GridViewIcon } from "@hugeicons/core-free-icons";
import { FormEvent, useState } from "react";
import { Button, Card, CardHeader, Chip, ChipGroup, ColorSwatch, Field, Input, Modal, SectionLabel, SegmentedControl } from "../../ui";
import { AiBadge } from "./AiBadge";
import { sortSizes } from "../../utils/format";
import { PRICE_ERROR, isValidPrice } from "../../utils/price";
import { normalizeSize } from "./helpers";
import { LETTER_SIZES, NAMED_COLORS, NUMBER_SIZES, type SimpleDetails as SimpleDetailsValue } from "./simple";
import styles from "./ProductForm.module.css";

export type SimpleField = "price" | "sizes" | "colors";

interface SimpleDetailsProps {
  value: SimpleDetailsValue;
  /** Updater form, so quick taps in a row never overwrite each other. */
  onChange: (field: SimpleField, update: (current: SimpleDetailsValue) => SimpleDetailsValue) => void;
  /** Fields the AI just filled: marked until the owner edits them. */
  aiFilled: Set<string>;
  onSwitchToAdvanced: () => void;
}

const isNumericSize = (size: string) => /^\d+$/.test(size);

/** «Цена, размеры и цвета»: one price, tap sizes and colors — no combinations table. */
export function SimpleDetails({ value, onChange, aiFilled, onSwitchToAdvanced }: SimpleDetailsProps) {
  const [sizeKind, setSizeKind] = useState<"letters" | "numbers">(() => (value.sizes.some(isNumericSize) ? "numbers" : "letters"));
  const [modal, setModal] = useState<"size" | "color" | null>(null);
  const [customSize, setCustomSize] = useState("");
  const [customColor, setCustomColor] = useState({ name: "", hex: "#94A3B8" });

  const presets = sizeKind === "letters" ? LETTER_SIZES : NUMBER_SIZES;
  const sizeChips = [...presets, ...value.sizes.filter((size) => !presets.includes(size))];
  const colorChips = [...NAMED_COLORS, ...value.colors.filter((color) => !NAMED_COLORS.some((named) => named.name === color.name))];

  function toggleSize(size: string) {
    onChange("sizes", (current) => ({
      ...current,
      sizes: sortSizes(current.sizes.includes(size) ? current.sizes.filter((item) => item !== size) : [...current.sizes, size])
    }));
  }

  function toggleColor(color: { name: string; hex: string }) {
    onChange("colors", (current) => ({
      ...current,
      colors: current.colors.some((item) => item.name === color.name)
        ? current.colors.filter((item) => item.name !== color.name)
        : [...current.colors, color]
    }));
  }

  function addCustomSize(event: FormEvent) {
    event.preventDefault();
    const size = /^[a-z]+$/i.test(customSize.trim()) ? normalizeSize(customSize) : customSize.trim();
    if (size) onChange("sizes", (current) => (current.sizes.includes(size) ? current : { ...current, sizes: sortSizes([...current.sizes, size]) }));
    setCustomSize("");
    setModal(null);
  }

  function addCustomColor(event: FormEvent) {
    event.preventDefault();
    const name = customColor.name.trim();
    const hex = customColor.hex;
    if (name) {
      onChange("colors", (current) =>
        current.colors.some((color) => color.name.toLowerCase() === name.toLowerCase()) ? current : { ...current, colors: [...current.colors, { name, hex }] }
      );
    }
    setCustomColor({ name: "", hex: "#94A3B8" });
    setModal(null);
  }

  return (
    <Card as="section" className={styles.section}>
      <CardHeader title="Цена, размеры и цвета" />
      <Field
        label={
          <>
            Цена, ₽ <AiBadge show={aiFilled.has("price")} />
          </>
        }
        hint="Оставьте пустым, если цену лучше уточнять в магазине"
        error={isValidPrice(value.price) ? undefined : PRICE_ERROR}
      >
        <Input
          inputMode="decimal"
          value={value.price}
          onChange={(event) => {
            const price = event.target.value;
            onChange("price", (current) => ({ ...current, price }));
          }}
          placeholder="Например, 2500"
        />
      </Field>

      <div className={styles.builderBlock}>
        <div className={styles.blockHead}>
          <SectionLabel>
            Размеры <AiBadge show={aiFilled.has("sizes")} />
          </SectionLabel>
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
          {sizeChips.map((size) => (
            <Chip key={size} className={styles.sizeChip} selected={value.sizes.includes(size)} onClick={() => toggleSize(size)}>
              {size}
            </Chip>
          ))}
          <Chip dashed icon={Add01Icon} onClick={() => setModal("size")}>
            Свой размер
          </Chip>
        </ChipGroup>
      </div>

      <div className={styles.builderBlock}>
        <SectionLabel>
          Цвета <AiBadge show={aiFilled.has("colors")} />
        </SectionLabel>
        <ChipGroup label="Цвета">
          {colorChips.map((color) => (
            <Chip key={color.name} selected={value.colors.some((item) => item.name === color.name)} onClick={() => toggleColor(color)}>
              <ColorSwatch color={color.hex} size="sm" />
              {color.name}
            </Chip>
          ))}
          <Chip dashed icon={Add01Icon} onClick={() => setModal("color")}>
            Другой цвет
          </Chip>
        </ChipGroup>
      </div>

      <Button variant="ghost" size="sm" icon={GridViewIcon} className={styles.modeLink} onClick={onSwitchToAdvanced}>
        Разные цены для размеров или цветов
      </Button>

      {modal === "size" && (
        <Modal
          size="sm"
          title="Свой размер"
          onClose={() => setModal(null)}
          onSubmit={addCustomSize}
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

      {modal === "color" && (
        <Modal
          size="sm"
          title="Другой цвет"
          onClose={() => setModal(null)}
          onSubmit={addCustomColor}
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
            <span className={styles.hint}>Выберите оттенок на палитре</span>
          </div>
        </Modal>
      )}
    </Card>
  );
}
