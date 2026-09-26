import { ArrowUpRight01Icon, CheckmarkCircle02Icon, Delete02Icon, Edit02Icon, PackageRemoveIcon, Tag01Icon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import type { Product } from "../../types/models";
import { Badge, Menu, Switch, useToast } from "../../ui";
import { ProductPhoto } from "../ProductPhoto";
import { availabilityLabels, availabilityTones, productPrice } from "./productLabels";
import styles from "./OwnerProductItem.module.css";

interface OwnerProductItemProps {
  product: Product;
  storeId: string;
  storeSlug: string;
  onUpdated: (product: Product) => void;
  onEditPrice: (product: Product) => void;
  onDelete: (product: Product) => void;
}

/** One product in the owner's list: photo, price, and the everyday actions without opening the form. */
export function OwnerProductItem({ product, storeId, storeSlug, onUpdated, onEditPrice, onDelete }: OwnerProductItemProps) {
  const toast = useToast();
  const navigate = useNavigate();
  const [isSaving, setIsSaving] = useState(false);
  const editUrl = `/dashboard/stores/${storeId}/products/${product.id}/edit`;
  const isVisible = Boolean(product.isVisible);
  const image = product.images[0];

  async function patch(body: Partial<Product>, message: string) {
    setIsSaving(true);
    try {
      const { data } = await api.patch<Product>(`/owner/stores/${storeId}/products/${product.id}`, body);
      onUpdated(data);
      toast.show(message);
    } catch (err: any) {
      toast.show(err?.response?.data?.message ?? "Не удалось сохранить. Попробуйте ещё раз.", { tone: "danger" });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <article className={styles.item}>
      <Link to={editUrl} className={styles.photo} aria-label={`Редактировать «${product.title}»`}>
        {image ? <ProductPhoto src={image.url} sizes="72px" /> : <span>{product.title.slice(0, 1)}</span>}
      </Link>
      <div className={styles.body}>
        <Link to={editUrl} className={styles.title}>
          {product.title}
        </Link>
        <span className={styles.price}>{productPrice(product)}</span>
        <div className={styles.badges}>
          {!isVisible && <Badge tone="warning">Скрыт с витрины</Badge>}
          {product.status !== "AVAILABLE" && <Badge tone={availabilityTones[product.status]}>{availabilityLabels[product.status]}</Badge>}
          {product.category && <span className={styles.category}>{product.category}</span>}
        </div>
      </div>
      <div className={styles.actions}>
        <Switch
          checked={isVisible}
          disabled={isSaving}
          label="На витрине"
          onChange={(value) => patch({ isVisible: value ? 1 : 0 }, value ? "Товар снова на витрине" : "Товар скрыт с витрины")}
        />
        <Menu
          label={`Действия с товаром «${product.title}»`}
          items={[
            { label: "Изменить цену", icon: Tag01Icon, onSelect: () => onEditPrice(product) },
            product.status === "NOT_AVAILABLE"
              ? { label: "Снова в наличии", icon: CheckmarkCircle02Icon, onSelect: () => patch({ status: "AVAILABLE" }, "Отмечено: в наличии") }
              : { label: "Нет в наличии", icon: PackageRemoveIcon, onSelect: () => patch({ status: "NOT_AVAILABLE" }, "Отмечено: нет в наличии") },
            { label: "Редактировать", icon: Edit02Icon, onSelect: () => navigate(editUrl) },
            { label: "Открыть на витрине", icon: ArrowUpRight01Icon, onSelect: () => navigate(`/m/${storeSlug}/p/${product.id}`) },
            { label: "Удалить", icon: Delete02Icon, danger: true, onSelect: () => onDelete(product) }
          ]}
        />
      </div>
    </article>
  );
}
