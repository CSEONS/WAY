import { Add01Icon, Cancel01Icon, ColorPickerIcon } from "@hugeicons/core-free-icons";
import { FormEvent, useState, type ReactNode } from "react";
import { Button, Card, CardHeader, Chip, ChipGroup, ColorSwatch, Field, IconButton, Input, Modal, SectionLabel, SegmentedControl, Switch } from "../../ui";
import { AiBadge } from "./AiBadge";
import { sortSizes } from "../../utils/format";
import { PRICE_ERROR, isValidPrice } from "../../utils/price";
import { combinationsLabel, normalizeHex, normalizeSize } from "./helpers";
import {
  LETTER_SIZES,
  NAMED_COLORS,
  NUMBER_SIZES,
  combinations,
  type Combination,
  type SimpleDetails as SimpleDetailsValue,
  type VariantPrices
} from "./simple";
import type { DetailsMode } from "./types";
import styles from "./ProductForm.module.css";

export type SimpleField = "price" | "sizes" | "colors";

interface PriceDetailsProps {
  value: SimpleDetailsValue;
  /** Updater form, so quick taps in a row never overwrite each other. */
  onChange: (field: SimpleField, update: (current: SimpleDetailsValue) => SimpleDetailsValue) => void;
  mode: DetailsMode;
  onModeChange: (mode: DetailsMode) => void;
  variantPrices: VariantPrices;
  onVariantPricesChange: (update: (current: VariantPrices) => VariantPrices) => void;
  /** Fields the AI just filled: marked until the owner edits them. */
  aiFilled: Set<string>;
  /** «Вручную + ИИ»: «Заполнить с ИИ» next to «Цвета». */
  colorsAction?: ReactNode;
  /** The cover photo: the eyedropper takes a color from it. */
  coverUrl?: string;
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

/** What a combination is called in the price list: its size, or its color when no sizes are ticked. */
function combinationLabel({ color, size }: Combination) {
  return size ?? color?.name ?? "";
}

/**
 * «Цена, размеры и цвета»: tap sizes and colors, set the price. The switch on
 * top turns on «Разные цены»: then every color × size gets a line with its
 * own price (empty — the usual one), and a combination that isn't sold can be
 * taken out and put back. Both ways look and work the same; switching loses nothing.
 */
export function PriceDetails({ value, onChange, mode, onModeChange, variantPrices, onVariantPricesChange, aiFilled, colorsAction, coverUrl }: PriceDetailsProps) {
  const [sizeKind, setSizeKind] = useState<"letters" | "numbers">(() => (value.sizes.some(isNumericSize) ? "numbers" : "letters"));
  const [modal, setModal] = useState<"size" | "color" | null>(null);
  const [customSize, setCustomSize] = useState("");
  const [customColor, setCustomColor] = useState({ name: "", hex: "#94A3B8" });
  const isDifferent = mode === "advanced";

  const presets = sizeKind === "letters" ? LETTER_SIZES : NUMBER_SIZES;
  const sizeChips = [...presets, ...value.sizes.filter((size) => !presets.includes(size))];
  const colorChips = [...NAMED_COLORS, ...value.colors.filter((color) => !NAMED_COLORS.some((named) => named.name === color.name))];

  const all = combinations(value);
  const missing = new Set(variantPrices.missing);
  const sold = all.filter((combination) => !missing.has(combination.key));
  // Sizes under each color; with only sizes or only colors ticked — one plain list.
  const groups =
    value.colors.length && value.sizes.length
      ? value.colors.map((color) => ({ color, items: all.filter((combination) => combination.color?.name === color.name) }))
      : [{ color: null, items: all }];

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

  function setCombinationPrice(key: string, price: string) {
    onVariantPricesChange((current) => ({ ...current, prices: { ...current.prices, [key]: price } }));
  }

  function setSold(key: string, isSold: boolean) {
    onVariantPricesChange((current) => ({
      ...current,
      missing: isSold ? current.missing.filter((item) => item !== key) : [...current.missing.filter((item) => item !== key), key]
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
      <Switch
        checked={isDifferent}
        onChange={(checked) => onModeChange(checked ? "advanced" : "simple")}
        label="Разные цены для размеров и цветов"
        description={
          isDifferent ? "Покупатель выберет цвет и размер и увидит их цену" : "Включите, если, например, XXL дороже остальных. Сейчас цена одна, покупатели просто видят размеры и цвета"
        }
      />

      <Field
        label={
          <>
            {isDifferent ? "Обычная цена, ₽" : "Цена, ₽"} <AiBadge show={aiFilled.has("price")} />
          </>
        }
        hint={isDifferent ? "Для всех размеров и цветов, у которых ниже не указана своя цена" : "Оставьте пустым, если цену лучше уточнять в магазине"}
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
        <div className={styles.blockHead}>
          <SectionLabel>
            Цвета <AiBadge show={aiFilled.has("colors")} />
          </SectionLabel>
          {colorsAction}
        </div>
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

      {isDifferent && (
        <div className={styles.builderBlock}>
          <div className={styles.blockHead}>
            <SectionLabel>Цены</SectionLabel>
            {sold.length > 0 && <span className={styles.count}>{combinationsLabel(sold.length)}</span>}
          </div>
          {all.length ? (
            <>
              <p className={styles.hint}>Поставьте цену там, где она не обычная. Крестик — такого сочетания нет в продаже.</p>
              {groups.map(({ color, items }) => {
                const notSold = items.filter((combination) => missing.has(combination.key));
                return (
                  <div className={styles.priceGroup} key={color?.name ?? "all"}>
                    {color && (
                      <span className={styles.priceGroupHead}>
                        <ColorSwatch color={color.hex} size="sm" />
                        {color.name}
                      </span>
                    )}
                    {items
                      .filter((combination) => !missing.has(combination.key))
                      .map((combination) => {
                        const label = combinationLabel(combination);
                        const price = variantPrices.prices[combination.key] ?? "";
                        return (
                          <div className={styles.priceRow} key={combination.key}>
                            <span className={styles.priceLabel}>
                              {!combination.size && combination.color && <ColorSwatch color={combination.color.hex} size="sm" />}
                              {label}
                            </span>
                            <Input
                              inputMode="decimal"
                              className={styles.priceInput}
                              value={price}
                              invalid={!isValidPrice(price)}
                              placeholder={value.price.trim() || "Уточнить"}
                              aria-label={`Цена: ${color ? `${color.name}, ` : ""}${label}`}
                              onChange={(event) => setCombinationPrice(combination.key, event.target.value)}
                            />
                            <IconButton
                              icon={Cancel01Icon}
                              label={`Нет в продаже: ${color ? `${color.name}, ` : ""}${label}`}
                              variant="ghost"
                              onClick={() => setSold(combination.key, false)}
                            />
                          </div>
                        );
                      })}
                    {notSold.length > 0 && (
                      <div className={styles.notSold}>
                        <span className={styles.hint}>Нет в продаже:</span>
                        {notSold.map((combination) => (
                          <Chip key={combination.key} dashed icon={Add01Icon} onClick={() => setSold(combination.key, true)}>
                            {combinationLabel(combination)}
                          </Chip>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          ) : (
            <p className={styles.hint}>Отметьте размеры или цвета выше — у каждого сочетания можно будет поставить свою цену.</p>
          )}
        </div>
      )}

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
            {eyeDropperSupported && coverUrl && (
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
            <span className={styles.hint}>{eyeDropperSupported && coverUrl ? "Оттенок — на палитре или пипеткой с фото" : "Выберите оттенок на палитре"}</span>
          </div>
          {eyeDropperSupported && coverUrl && (
            <div className={styles.pipettePreview}>
              <img src={coverUrl} alt="Фото товара для пипетки" />
            </div>
          )}
        </Modal>
      )}
    </Card>
  );
}
