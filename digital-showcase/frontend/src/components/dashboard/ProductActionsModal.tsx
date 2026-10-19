import { Delete02Icon, Tag01Icon, ViewIcon, ViewOffSlashIcon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { api } from "../../api/client";
import type { Product, ProductStatus } from "../../types/models";
import { Button, Modal, SectionLabel, SegmentedControl, useToast } from "../../ui";
import styles from "./ProductActionsModal.module.css";

interface ProductActionsModalProps {
  product: Product;
  storeId: string;
  onClose: () => void;
  onChanged: (product: Product) => void;
  /** These open their own windows: this one closes first. */
  onEditPrice: () => void;
  onDelete: () => void;
}

const availability: { value: ProductStatus; label: string }[] = [
  { value: "AVAILABLE", label: "В наличии" },
  { value: "CHECK_IN_STORE", label: "Уточнять" },
  { value: "NOT_AVAILABLE", label: "Нет в наличии" }
];

const availabilityDone: Record<ProductStatus, string> = {
  AVAILABLE: "Отмечено: в наличии",
  CHECK_IN_STORE: "Отмечено: наличие уточнять в магазине",
  NOT_AVAILABLE: "Отмечено: нет в наличии"
};

/** «Ещё действия» on the owner's product page: the storefront, availability, price, deleting. */
export function ProductActionsModal({ product, storeId, onClose, onChanged, onEditPrice, onDelete }: ProductActionsModalProps) {
  const toast = useToast();
  const [busy, setBusy] = useState<"visibility" | "status" | null>(null);
  const isVisible = Boolean(product.isVisible);

  async function patch(body: Partial<Product>, what: "visibility" | "status", message: string) {
    setBusy(what);
    try {
      const { data } = await api.patch<Product>(`/owner/stores/${storeId}/products/${product.id}`, body);
      onChanged(data);
      toast.show(message, { tone: "success" });
    } catch (err: any) {
      toast.show(err?.response?.data?.message ?? "Не удалось сохранить. Попробуйте ещё раз.", { tone: "danger" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal size="sm" title="Действия с товаром" description={product.title} onClose={onClose}>
      <div className={styles.group}>
        <SectionLabel>Витрина</SectionLabel>
        <Button
          variant={isVisible ? "outline" : "primary"}
          block
          icon={isVisible ? ViewOffSlashIcon : ViewIcon}
          loading={busy === "visibility"}
          onClick={() => patch({ isVisible: isVisible ? 0 : 1 }, "visibility", isVisible ? "Товар скрыт с витрины" : "Товар снова на витрине")}
        >
          {isVisible ? "Скрыть с витрины" : "Показать на витрине"}
        </Button>
        <span className={styles.hint}>
          {product.blockedAt
            ? "Товар снят администратором: пока его не вернут, покупатели его не видят."
            : isVisible
              ? "Покупатели перестанут видеть товар. Вам он останется доступен."
              : "Покупатели снова увидят товар в каталоге."}
        </span>
      </div>

      <div className={styles.group}>
        <SectionLabel>Наличие</SectionLabel>
        <SegmentedControl
          label="Наличие"
          size="sm"
          value={product.status}
          onChange={(status) => {
            if (status !== product.status) void patch({ status }, "status", availabilityDone[status]);
          }}
          options={availability}
        />
      </div>

      <div className={styles.group}>
        <Button variant="secondary" block icon={Tag01Icon} onClick={onEditPrice}>
          Изменить цену
        </Button>
        <Button variant="danger" block icon={Delete02Icon} onClick={onDelete}>
          Удалить товар
        </Button>
      </div>
    </Modal>
  );
}
