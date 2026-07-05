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
    <Link className={isUnavailable ? "product-card unavailable" : "product-card"} to={`/m/${slug}/p/${product.id}`}>
      {isUnavailable && <span className="unavailable-overlay">Нет в наличии</span>}
      <span className="product-badge">Новинка</span>
      <div className="product-image">
        {product.images[0] ? <img src={product.images[0].url} alt={product.title} /> : <span>Фото скоро</span>}
      </div>
      <div className="product-body">
        <h3>{product.title}</h3>
        <p>{priceText}</p>
        <small>{product.category || "Без категории"}</small>
        <div className="card-meta">
          {product.sizes.map((size) => (
            <span key={size.id}>{size.value}</span>
          ))}
          <div className="color-stack">
            {product.colors.map((color) => (
              <span key={color.id} title={color.name} style={{ background: color.hex ?? "#d8e5e8" }} />
            ))}
          </div>
        </div>
        {product.status !== "NOT_AVAILABLE" && <strong className="stock-status">{statusMap[product.status]}</strong>}
      </div>
    </Link>
  );
}
