import { HugeiconsIcon } from "@hugeicons/react";
import { Image01Icon } from "@hugeicons/core-free-icons";
import { Link } from "react-router-dom";
import type { Product } from "../types/models";

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
    <Link className="product-card" to={`/m/${slug}/p/${product.id}`}>
      {isUnavailable && (
        <span className="product-card-badge badge badge-danger">Нет в наличии</span>
      )}
      <div className="product-card-media">
        {product.images[0] ? (
          <img src={product.images[0].url} alt={product.title} />
        ) : (
          <div className="product-card-placeholder">
            <HugeiconsIcon icon={Image01Icon} size={22} strokeWidth={1.6} />
          </div>
        )}
      </div>
      <div className="product-card-body">
        <h3>{product.title}</h3>
        <p>{priceText}</p>
        <small>{product.category || "Без категории"}</small>
        <div className="product-card-meta">
          {product.sizes.map((size) => (
            <span key={size.id} className="badge badge-neutral">
              {size.value}
            </span>
          ))}
          {Boolean(product.colors.length) && (
            <div className="swatch-row">
              {product.colors.map((color) => (
                <span key={color.id} className="swatch" title={color.name} style={{ background: color.hex ?? "#d8e5e8" }} />
              ))}
            </div>
          )}
        </div>
        {product.status !== "NOT_AVAILABLE" && <strong className="badge badge-success">{statusMap[product.status]}</strong>}
      </div>
    </Link>
  );
}

