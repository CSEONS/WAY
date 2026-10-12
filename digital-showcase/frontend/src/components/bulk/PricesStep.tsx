import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { useEffect, useRef, useState } from "react";
import type { ProductStatus } from "../../types/models";
import { PRICE_ERROR, isValidPrice } from "../../utils/price";
import { Button, Card, Field, Input, Select, Textarea, cx } from "../../ui";
import { ASK_SELLER } from "../product-form/helpers";
import { type BulkDraft, type BulkPhoto, type Layout, withPrice, withPriceForAll } from "./grouping";
import styles from "./Bulk.module.css";

const statusOptions = [
  { value: "AVAILABLE", label: "В наличии" },
  { value: "CHECK_IN_STORE", label: ASK_SELLER },
  { value: "NOT_AVAILABLE", label: "Нет в наличии" }
];

interface PricesStepProps {
  photos: BulkPhoto[];
  layout: Layout;
  onChange: (layout: Layout) => void;
  /** Grows on every «Опубликовать» that found a mistake: show the errors and jump to the first one. */
  errorsShown: number;
}

/** Step 3: a name and a price per product. Everything else the AI filled in stays under «Ещё». */
export function PricesStep({ photos, layout, onChange, errorsShown }: PricesStepProps) {
  const [priceForAll, setPriceForAll] = useState("");
  const [openIds, setOpenIds] = useState<string[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (errorsShown) listRef.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus();
  }, [errorsShown]);

  function update(id: string, change: (draft: BulkDraft) => BulkDraft) {
    onChange({ ...layout, drafts: layout.drafts.map((draft) => (draft.id === id ? change(draft) : draft)) });
  }

  function toggleMore(id: string) {
    setOpenIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  return (
    <>
      {layout.drafts.length > 1 && (
        <Card as="section">
          <div className={styles.priceAll}>
            <Field label="Одна цена для всех товаров" error={isValidPrice(priceForAll) ? undefined : PRICE_ERROR}>
              <Input inputMode="decimal" value={priceForAll} onChange={(event) => setPriceForAll(event.target.value)} placeholder="Например, 1500" />
            </Field>
            <Button variant="secondary" disabled={!priceForAll.trim() || !isValidPrice(priceForAll)} onClick={() => onChange(withPriceForAll(layout, priceForAll.trim()))}>
              Поставить всем
            </Button>
          </div>
        </Card>
      )}

      <div className={styles.flow} ref={listRef}>
        {layout.drafts.map((draft) => {
          const isOpen = openIds.includes(draft.id);
          return (
            <Card as="article" key={draft.id}>
              <div className={styles.item}>
                <img className={styles.photo} src={photos[draft.photos[0]]?.url} alt="" />
                <div className={styles.itemFields}>
                  <Field label="Название" required error={errorsShown > 0 && !draft.title.trim() ? "Введите название" : undefined}>
                    <Input value={draft.title} onChange={(event) => update(draft.id, (current) => ({ ...current, title: event.target.value }))} placeholder="Название товара" />
                  </Field>
                  <Field label="Цена, ₽" error={isValidPrice(draft.price) ? undefined : PRICE_ERROR} hint={draft.price.trim() ? undefined : `Без цены покупатель увидит «${ASK_SELLER}».`}>
                    <Input inputMode="decimal" value={draft.price} onChange={(event) => update(draft.id, (current) => withPrice(current, event.target.value))} placeholder="Например, 2500" />
                  </Field>
                </div>
                <div className={styles.itemMore}>
                  <Button
                    variant="ghost"
                    size="sm"
                    iconEnd={ArrowDown01Icon}
                    className={cx(styles.moreToggle, isOpen && styles.chevronOpen)}
                    aria-expanded={isOpen}
                    onClick={() => toggleMore(draft.id)}
                  >
                    Ещё: описание, размеры, цвета
                  </Button>
                  {isOpen && (
                    <div className={styles.itemMoreFields}>
                      <Field label="Описание" className={styles.wide}>
                        <Textarea value={draft.description} onChange={(event) => update(draft.id, (current) => ({ ...current, description: event.target.value }))} />
                      </Field>
                      <Field label="Размеры" hint="Через запятую: S, M, L">
                        <Input value={draft.sizes} onChange={(event) => update(draft.id, (current) => ({ ...current, sizes: event.target.value }))} placeholder={ASK_SELLER} />
                      </Field>
                      <Field label="Цвета" hint="Через запятую: синий, белый">
                        <Input value={draft.colors} onChange={(event) => update(draft.id, (current) => ({ ...current, colors: event.target.value }))} />
                      </Field>
                      <Field label="Категория">
                        <Input value={draft.category} onChange={(event) => update(draft.id, (current) => ({ ...current, category: event.target.value }))} placeholder="Например, платья" />
                      </Field>
                      <Field label="Наличие">
                        <Select value={draft.status} onChange={(value) => update(draft.id, (current) => ({ ...current, status: value as ProductStatus }))} options={statusOptions} />
                      </Field>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
