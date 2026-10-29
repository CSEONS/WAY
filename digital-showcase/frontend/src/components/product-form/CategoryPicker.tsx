import { Add01Icon } from "@hugeicons/core-free-icons";
import { FormEvent, useState, type ReactNode } from "react";
import { Button, Chip, ChipGroup, Field, Input, Modal } from "../../ui";
import { CATEGORY_PRESETS } from "./simple";

interface CategoryPickerProps {
  value: string;
  onChange: (category: string) => void;
  /** Categories the store already gave its products, the most used first. */
  storeCategories: string[];
  /** The label with its «ИИ» mark. */
  label: ReactNode;
  /** «Вручную + ИИ»: «Заполнить с ИИ». */
  action?: ReactNode;
}

const categoryKey = (category: string) => category.trim().toLowerCase().replace(/ё/g, "е");

/**
 * «Категория»: tap one — the usual ones, the store's own, the one the AI
 * suggested — or «Своя категория», like «Свой размер». A category given once
 * comes back as a button for the store's next products.
 */
export function CategoryPicker({ value, onChange, storeCategories, label, action }: CategoryPickerProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState("");
  const seen = new Set<string>();
  const chips = [...CATEGORY_PRESETS, ...storeCategories, value].filter((category) => {
    const key = categoryKey(category);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  function addCategory(event: FormEvent) {
    event.preventDefault();
    const typed = name.trim().replace(/\s+/g, " ");
    // «сумки» when «Сумки» is there already: the existing one.
    if (typed) onChange(chips.find((category) => categoryKey(category) === categoryKey(typed)) ?? typed);
    setName("");
    setIsAdding(false);
  }

  return (
    <Field label={label} action={action}>
      <ChipGroup label="Категория">
        {chips.map((category) => (
          <Chip key={category} selected={value === category} onClick={() => onChange(value === category ? "" : category)}>
            {category}
          </Chip>
        ))}
        <Chip dashed icon={Add01Icon} onClick={() => setIsAdding(true)}>
          Своя категория
        </Chip>
      </ChipGroup>

      {isAdding && (
        <Modal
          size="sm"
          title="Своя категория"
          onClose={() => setIsAdding(false)}
          onSubmit={addCategory}
          footer={
            <Button type="submit" variant="primary">
              Добавить
            </Button>
          }
        >
          <Field label="Название категории" hint="Например: Сумки, Детская одежда. Так её увидят покупатели в фильтре витрины">
            <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required autoFocus />
          </Field>
        </Modal>
      )}
    </Field>
  );
}
