import { Image01Icon } from "@hugeicons/core-free-icons";
import { Link } from "react-router-dom";
import type { Product } from "../types/models";
import { isNewProduct, sortSizes } from "../utils/format";
import { Badge, ColorSwatch, Icon } from "../ui";
import { ProductPhoto } from "./ProductPhoto";
import { FavoriteButton } from "./storefront/FavoriteButton";
import styles from "./ProductCard.module.css";

const statusMap = {
  AVAILABLE: "В наличии",
  NOT_AVAILABLE: "Нет в наличии",
  CHECK_IN_STORE: "Уточнить в магазине"
};

// Two columns on phones, four from 720px, the page is at most 1180px wide.
const PHOTO_SIZES = "(min-width: 1180px) 280px, (min-width: 720px) 25vw, 50vw";

interface ProductCardProps {
  product: Product;
  slug: string;
  favorite?: boolean;
  onToggleFavorite?: () => void;
}

export function ProductCard({ product, slug, favorite = false, onToggleFavorite }: ProductCardProps) {
  const variantPrices = product.variants.map((variant) => variant.price).filter((price): price is number => price != null);
  const minPrice = variantPrices.length ? Math.min(...variantPrices) : null;
  const displayPrice = product.price ?? minPrice;
  const isUnavailable = product.status === "NOT_AVAILABLE";
  const priceText = product.priceText
    ? `Цена: ${product.priceText}`
    : displayPrice != null
      ? `${product.price == null && variantPrices.length > 1 && new Set(variantPrices).size > 1 ? "от " : ""}${displayPrice.toLocaleString("ru-RU")} ₽`
      : "Цена в магазине";

  return (
    <div className={styles.card}>
      <Link className={styles.link} to={`/m/${slug}/p/${product.id}`}>
        {isUnavailable ? (
          <Badge tone="danger" className={styles.badge}>
            Нет в наличии
          </Badge>
        ) : (
          isNewProduct(product.createdAt) && (
            <Badge tone="accent" className={styles.badge}>
              Новинка
            </Badge>
          )
        )}
        <div className={styles.media}>
          {product.images[0] ? (
            <ProductPhoto className={styles.image} src={product.images[0].url} sizes={PHOTO_SIZES} alt={product.title} />
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
      {onToggleFavorite && <FavoriteButton variant="overlay" active={favorite} onToggle={onToggleFavorite} className={styles.favorite} />}
    </div>
  );
}
