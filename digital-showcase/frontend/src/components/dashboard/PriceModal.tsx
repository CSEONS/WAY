import { FormEvent, useState } from "react";
import { api } from "../../api/client";
import type { Product } from "../../types/models";
import { PRICE_ERROR, parsePrice } from "../../utils/price";
import { Button, Field, Input, Modal, Notice, useToast } from "../../ui";
import { variantPriceRange } from "./productLabels";

interface PriceModalProps {
  product: Product;
  storeId: string;
  onClose: () => void;
  onSaved: (product: Product) => void;
}

/** Quick price change from the product list. Sets one price for the product and all its variants. */
export function PriceModal({ product, storeId, onClose, onSaved }: PriceModalProps) {
  const toast = useToast();
  const firstVariantPrice = product.variants.find((variant) => variant.price != null)?.price;
  const [value, setValue] = useState(() => String(product.price ?? firstVariantPrice ?? ""));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const range = variantPriceRange(product);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const price = parsePrice(value);
    if (Number.isNaN(price)) {
      setError(PRICE_ERROR);
      return;
    }
    setIsSaving(true);
    try {
      const { data } = await api.patch<Product>(`/owner/stores/${storeId}/products/${product.id}`, {
        price,
        priceText: null,
        ...(product.variants.length
          ? { variants: product.variants.map((variant) => ({ colorName: variant.colorName, colorHex: variant.colorHex, size: variant.size, price })) }
          : {})
      });
      onSaved(data);
      toast.show("Цена обновлена", { tone: "success" });
      onClose();
    } catch (err: any) {
      toast.show(err?.response?.data?.message ?? "Не удалось сохранить цену", { tone: "danger" });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      size="sm"
      title="Изменить цену"
      description={product.title}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" variant="primary" loading={isSaving}>
            Сохранить
          </Button>
        </>
      }
    >
      <Field label="Цена, ₽" hint="Оставьте пустым — покупатели увидят «Цена в магазине»" error={error}>
        <Input
          inputMode="decimal"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setError("");
          }}
        />
      </Field>
      {range && (
        <Notice tone="warning">
          Сейчас у размеров и цветов разные цены ({range}). Новая цена будет у всех.
        </Notice>
      )}
    </Modal>
  );
}
