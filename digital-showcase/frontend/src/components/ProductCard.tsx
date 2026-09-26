import { Image01Icon } from "@hugeicons/core-free-icons";
import { Link } from "react-router-dom";
import type { Product } from "../types/models";
import { sortSizes } from "../utils/format";
import { Badge, ColorSwatch, Icon } from "../ui";
import styles from "./ProductCard.module.css";

const statusMap = {
  AVAILABLE: "В наличии",
  NOT_AVAILABLE: "Нет в наличии",
  CHECK_IN_STORE: "Уточнить в магазине"
};

export function ProductCard({ product, slug }: { product: Product; slug: string }) {
  const variantPrices = product.variants.map((variant) => variant.price).filter((price): price is number => price != null);
  const minPrice = variantPrices.length ? Math.min(...variantPrices) : null;
  const displayPrice = product.price ?? minPrice;
  const isUnavailable = product.status === "NOT_AVAILABLE";
  const priceText = product.priceText ? `Цена: ${product.priceText}` : displayPrice != null ? `${displayPrice.toLocaleString("ru-RU")} ₽` : "Цена в магазине";

  return (
    <Link className={styles.card} to={`/m/${slug}/p/${product.id}`}>
      {isUnavailable && (
        <Badge tone="danger" className={styles.badge}>
          Нет в наличии
        </Badge>
      )}
      <div className={styles.media}>
        {product.images[0] ? (
          <img className={styles.image} src={product.images[0].url} alt={product.title} loading="lazy" />
        ) : (
          <div className={styles.placeholder}>
            <Icon icon={Image01Icon} size="lg" strokeWidth={1.6} />
          </div>
        )}
      </div>
      <div className={styles.body}>
        <h3 className={styles.title}>{product.title}</h3>
        <p className={styles.price}>{priceText}</p>
        <small className={styles.category}>{product.category || "Без категории"}</small>
        <div className={styles.meta}>
          {sortSizes(product.sizes.map((size) => size.value)).map((size) => (
            <Badge key={size}>{size}</Badge>
          ))}
          {product.colors.map((color) => (
            <ColorSwatch key={color.id} color={color.hex} label={color.name} size="sm" />
          ))}
        </div>
        {!isUnavailable && (
          <Badge tone="success" className={styles.status}>
            {statusMap[product.status]}
          </Badge>
        )}
      </div>
    </Link>
  );
}
