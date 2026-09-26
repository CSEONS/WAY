import { Add01Icon, Delete02Icon, GridViewIcon, HelpCircleIcon } from "@hugeicons/core-free-icons";
import type { ReactNode } from "react";
import { Button, Card, CardHeader, Chip, ColorSwatch, IconButton, Input, SectionLabel, type IconSvgElement } from "../../ui";
import { ASK_SELLER, combinationsLabel, formatPrice, normalizeHex, normalizeSize } from "./helpers";
import type { VariantBuilderState } from "./useVariantBuilder";
import type { VariantModalType } from "./types";
import styles from "./ProductForm.module.css";

interface BuilderRowProps {
  label: string;
  isAskSelected: boolean;
  onAsk: () => void;
  onAdd: () => void;
  onShowAll: () => void;
  children: ReactNode;
}

function ToolChip({ icon, label, selected, onClick }: { icon: IconSvgElement; label: string; selected?: boolean; onClick: () => void }) {
  return <Chip dashed icon={icon} selected={selected} aria-label={label} title={label} onClick={onClick} />;
}

/** One line of the builder: «?» (ask the seller), «+» (new value), «все значения», then the remembered values. */
function BuilderRow({ label, isAskSelected, onAsk, onAdd, onShowAll, children }: BuilderRowProps) {
  return (
    <div className={styles.builderBlock}>
      <SectionLabel>{label}</SectionLabel>
      <div className={styles.chipRow}>
        <ToolChip icon={HelpCircleIcon} label="Уточнить у продавца" selected={isAskSelected} onClick={onAsk} />
        <ToolChip icon={Add01Icon} label="Добавить значение" onClick={onAdd} />
        <ToolChip icon={GridViewIcon} label="Просмотреть все значения" onClick={onShowAll} />
      </div>
      <div className={styles.chipRow}>{isAskSelected ? <span className={styles.note}>Уточнить у продавца</span> : children}</div>
    </div>
  );
}

export function VariantBuilder({ builder, onOpenModal }: { builder: VariantBuilderState; onOpenModal: (type: VariantModalType) => void }) {
  const { variants } = builder;

  return (
    <Card as="section" className={styles.section}>
      <CardHeader title="Комбинации товара" />
      <p className={styles.hint}>
        Выберите цвет, размер и цену, затем добавьте комбинацию. Для любого параметра можно выбрать «Уточнить у продавца», если он неизвестен заранее.
      </p>
      <BuilderRow
        label="Цвет"
        isAskSelected={builder.selectedColorName === ASK_SELLER}
        onAsk={() => builder.toggleColor(ASK_SELLER)}
        onAdd={() => onOpenModal("color")}
        onShowAll={() => onOpenModal("all-colors")}
      >
        {builder.colorHistory.map((color) => (
          <ColorSwatch
            key={`${color.name}-${color.hex}`}
            color={color.hex}
            label={color.name}
            size="lg"
            selected={builder.selectedColorName === color.name}
            onClick={() => builder.toggleColor(color.name)}
          />
        ))}
      </BuilderRow>
      <BuilderRow
        label="Размер"
        isAskSelected={builder.selectedSize === ASK_SELLER}
        onAsk={() => builder.toggleSize(ASK_SELLER)}
        onAdd={() => onOpenModal("size")}
        onShowAll={() => onOpenModal("all-sizes")}
      >
        {builder.sizeHistory.map((size) => (
          <Chip key={size} className={styles.sizeChip} selected={builder.selectedSize === size} onClick={() => builder.toggleSize(size)}>
            {size}
          </Chip>
        ))}
      </BuilderRow>
      <BuilderRow
        label="Цена"
        isAskSelected={builder.selectedPrice === ASK_SELLER}
        onAsk={() => builder.togglePrice(ASK_SELLER)}
        onAdd={() => onOpenModal("price")}
        onShowAll={() => onOpenModal("all-prices")}
      >
        {builder.priceHistory.map((price) => (
          <Chip key={price} selected={builder.selectedPrice === price} onClick={() => builder.togglePrice(price)}>
            {formatPrice(price)}
          </Chip>
        ))}
      </BuilderRow>
      <Button variant="primary" block disabled={!builder.canAddVariant} onClick={builder.addVariantFromSelection}>
        Добавить комбинацию
      </Button>

      <div className={styles.tableHeader}>
        <SectionLabel>Добавленные комбинации</SectionLabel>
        <span className={styles.count}>{combinationsLabel(variants.length)}</span>
      </div>
      <div className={styles.variantTable}>
        {variants.length ? (
          variants.map((variant, index) => (
            <div className={styles.variantRow} key={variant.id}>
              <div className={styles.variantName}>
                {variant.colorName === ASK_SELLER ? (
                  <span className={styles.variantNote}>Цвет: у продавца</span>
                ) : (
                  <ColorSwatch color={normalizeHex(variant.colorHex)} label={variant.colorName} size="md" />
                )}
                <span>{variant.size === ASK_SELLER ? "у продавца" : normalizeSize(variant.size)}</span>
              </div>
              {variant.price === ASK_SELLER ? (
                <span className={styles.variantNote}>у продавца</span>
              ) : (
                <Input
                  className={styles.variantPrice}
                  type="number"
                  value={variant.price}
                  onChange={(e) => builder.updateVariant(variant.id, { price: e.target.value })}
                  placeholder="Цена"
                  aria-label={`Цена комбинации ${index + 1}`}
                />
              )}
              <IconButton icon={Delete02Icon} label={`Удалить комбинацию ${index + 1}`} variant="danger" onClick={() => builder.removeVariant(variant.id)} />
            </div>
          ))
        ) : (
          <div className={styles.variantEmpty}>Комбинации ещё не добавлены</div>
        )}
      </div>
    </Card>
  );
}
