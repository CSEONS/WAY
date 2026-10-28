import { Add01Icon, Cancel01Icon, ColorPickerIcon, Undo02Icon } from "@hugeicons/core-free-icons";
import { FormEvent, useState, type ReactNode } from "react";
import { Button, Card, CardHeader, Chip, ChipGroup, ColorSwatch, Field, IconButton, Input, Modal, SectionLabel, SegmentedControl, cx } from "../../ui";
import { AiBadge } from "./AiBadge";
import { sortSizes } from "../../utils/format";
import { PRICE_ERROR, isValidPrice, parsePrice } from "../../utils/price";
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

/** «Бордовый / M»; just the size or the color when only one of them is ticked. */
function combinationName({ color, size }: Combination) {
  return [color?.name, size].filter(Boolean).join(" / ");
}

/** «2890» → «2 890»; anything that isn't a price stays as typed. */
function formatAmount(value: string) {
  const amount = parsePrice(value);
  return amount != null && !Number.isNaN(amount) ? amount.toLocaleString("ru-RU") : value;
}

/**
 * A combination's price as a pill, typed into in place: its own price filled
 * with the accent, the usual one pale (shown as the placeholder).
 */
function PricePill({ value, usual, label, onChange }: { value: string; usual: string; label: string; onChange: (value: string) => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const isOwn = Boolean(value.trim());
  const text = isEditing ? value : formatAmount(value);
  const placeholder = usual.trim() ? formatAmount(usual) : "Уточнить";
  return (
    <label className={cx(styles.pricePill, isOwn && styles.pricePillOwn, !isValidPrice(value) && styles.pricePillInvalid)}>
      <input
        className={styles.pricePillInput}
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        aria-label={`Цена: ${label}`}
        // As wide as what's in it.
        style={{ width: `${Math.max(2, (text || placeholder).length) + 0.5}ch` }}
        onFocus={() => setIsEditing(true)}
        onBlur={() => setIsEditing(false)}
        onChange={(event) => onChange(event.target.value)}
      />
      {(isOwn || usual.trim()) && <span aria-hidden="true">₽</span>}
    </label>
  );
}

/**
 * «Цена, размеры и цвета»: tap sizes and colors, set the price. «Одна цена /
 * Разные цены» on top: with different prices every color × size is a line
 * «Бордовый / M» with its price pill (empty — the usual price), and a
 * combination that isn't sold can be taken out and put back. Both ways look
 * and work the same; switching loses nothing.
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
      <div className={styles.builderBlock}>
        <SegmentedControl
          label="Как указать цену"
          size="sm"
          className={styles.priceMode}
          value={mode}
          onChange={onModeChange}
          options={[
            { value: "simple", label: "Одна цена" },
            { value: "advanced", label: "Разные цены" }
          ]}
        />
        <p className={styles.hint}>
          {isDifferent
            ? "У каждого сочетания цвета и размера — своя цена: покупатель выберет его и увидит её"
            : "Одна цена для всех размеров и цветов: покупатели видят их, но не выбирают. Если, например, XXL дороже — выберите «Разные цены»"}
        </p>
      </div>

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
              <p className={styles.hint}>Нажмите на цену, чтобы поменять: бледная — обычная, синяя — своя. Крестик — такого сочетания нет в продаже.</p>
              <ul className={styles.combos}>
                {all.map((combination) => {
                  const name = combinationName(combination);
                  const isSold = !missing.has(combination.key);
                  return (
                    <li className={cx(styles.combo, !combination.color && styles.comboNoColor, !isSold && styles.comboOff)} key={combination.key}>
                      {combination.color && <ColorSwatch color={combination.color.hex} size="md" />}
                      <span className={styles.comboName}>
                        {combination.color ? <strong>{combination.color.name}</strong> : <strong>{combination.size}</strong>}
                        {combination.color && combination.size && <span className={styles.comboSize}> / {combination.size}</span>}
                      </span>
                      {isSold ? (
                        <PricePill
                          value={variantPrices.prices[combination.key] ?? ""}
                          usual={value.price}
                          label={name}
                          onChange={(price) => setCombinationPrice(combination.key, price)}
                        />
                      ) : (
                        <span className={styles.comboOffNote}>нет в продаже</span>
                      )}
                      <IconButton
                        icon={isSold ? Cancel01Icon : Undo02Icon}
                        label={isSold ? `Нет в продаже: ${name}` : `Вернуть в продажу: ${name}`}
                        size="sm"
                        onClick={() => setSold(combination.key, !isSold)}
                      />
                    </li>
                  );
                })}
              </ul>
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
