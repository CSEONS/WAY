import { ArrowUpRight01Icon, CheckmarkCircle02Icon, Delete02Icon, Edit02Icon, PackageRemoveIcon, Tag01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { type ReactNode, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import type { Product } from "../../types/models";
import { Badge, Icon, Menu, Switch, cx, useToast } from "../../ui";
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
  /** «Выбрать» is on: a tap ticks the card instead of opening the product; the everyday actions step aside. */
  selecting?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}

/**
 * One product in the owner's list: photo, price, what buyers see, and the
 * everyday actions without opening the form. A product hidden from the
 * storefront is dimmed. While selecting, the whole card is one big tick box.
 */
export function OwnerProductItem({ product, storeId, storeSlug, onUpdated, onEditPrice, onDelete, selecting = false, selected = false, onToggleSelect }: OwnerProductItemProps) {
  const toast = useToast();
  const navigate = useNavigate();
  const [isSaving, setIsSaving] = useState(false);
  const editUrl = `/dashboard/stores/${storeId}/products/${product.id}/edit`;
  const isVisible = Boolean(product.isVisible);
  const image = product.images[0];
  // Photos with faces: the product waits for the moderator, or some of its photos stay hidden.
  const onModeration = product.images.some((item) => item.moderation?.status === "PENDING");
  const hasHiddenPhotos = product.images.some((item) => item.moderation?.status === "REJECTED");

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

  const photo = (
    <span className={cx(styles.photo, (!isVisible || product.blockedAt) && styles.dimmed)}>
      {image ? <ProductPhoto src={image.url} sizes="88px" /> : <span>{product.title.slice(0, 1)}</span>}
    </span>
  );
  const badges = (
    <div className={styles.badges}>
      {product.blockedAt && <Badge tone="danger">Снят администратором</Badge>}
      {!isVisible && <Badge tone="warning">Скрыт с витрины</Badge>}
      {onModeration && <Badge tone="warning">На проверке</Badge>}
      {hasHiddenPhotos && <Badge tone="danger">Фото скрыто</Badge>}
      {product.status !== "AVAILABLE" && <Badge tone={availabilityTones[product.status]}>{availabilityLabels[product.status]}</Badge>}
    </div>
  );
  const text = (title: ReactNode) => (
    <div className={styles.body}>
      {title}
      <span className={styles.price}>{productPrice(product)}</span>
      {product.category && <span className={styles.category}>{product.category}</span>}
      {badges}
    </div>
  );

  if (selecting) {
    return (
      <button type="button" className={cx(styles.item, styles.selectable, selected && styles.selected)} aria-pressed={selected} onClick={onToggleSelect}>
        <span className={styles.photoCell}>
          {photo}
          <span className={cx(styles.check, selected && styles.checked)} aria-hidden="true">
            {selected && <Icon icon={Tick02Icon} size="xs" strokeWidth={2.5} />}
          </span>
        </span>
        {text(<span className={styles.title}>{product.title}</span>)}
      </button>
    );
  }

  return (
    <article className={styles.item}>
      <Link to={editUrl} className={styles.photoCell} aria-label={`Редактировать «${product.title}»`}>
        {photo}
      </Link>
      {text(
        <Link to={editUrl} className={styles.title}>
          {product.title}
        </Link>
      )}
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
