import { Cancel01Icon, Undo02Icon } from "@hugeicons/core-free-icons";
import { useState, type ReactNode } from "react";
import { Card, CardHeader, ColorSwatch, Field, IconButton, Input, SectionLabel, SegmentedControl, cx } from "../../ui";
import { AiBadge } from "./AiBadge";
import { ColorPicker, SizePicker } from "./DetailPickers";
import { PRICE_ERROR, isValidPrice, parsePrice } from "../../utils/price";
import { combinationsLabel } from "./helpers";
import { combinations, type Combination, type SimpleDetails as SimpleDetailsValue, type VariantPrices } from "./simple";
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
  const isDifferent = mode === "advanced";

  const all = combinations(value);
  const missing = new Set(variantPrices.missing);
  const sold = all.filter((combination) => !missing.has(combination.key));

  function setCombinationPrice(key: string, price: string) {
    onVariantPricesChange((current) => ({ ...current, prices: { ...current.prices, [key]: price } }));
  }

  function setSold(key: string, isSold: boolean) {
    onVariantPricesChange((current) => ({
      ...current,
      missing: isSold ? current.missing.filter((item) => item !== key) : [...current.missing.filter((item) => item !== key), key]
    }));
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

      <SizePicker
        value={value.sizes}
        onChange={(update) => onChange("sizes", (current) => ({ ...current, sizes: update(current.sizes) }))}
        label={
          <>
            Размеры <AiBadge show={aiFilled.has("sizes")} />
          </>
        }
      />

      <ColorPicker
        value={value.colors}
        onChange={(update) => onChange("colors", (current) => ({ ...current, colors: update(current.colors) }))}
        label={
          <>
            Цвета <AiBadge show={aiFilled.has("colors")} />
          </>
        }
        action={colorsAction}
        coverUrl={coverUrl}
      />

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

    </Card>
  );
}
