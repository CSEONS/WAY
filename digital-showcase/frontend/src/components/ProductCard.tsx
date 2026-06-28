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

  return (
    <Link className="product-card" to={`/m/${slug}/p/${product.id}`}>
      <div className="product-image">
        {product.images[0] ? <img src={product.images[0].url} alt={product.title} /> : <span>Фото скоро</span>}
      </div>
      <div className="product-body">
        <h3>{product.title}</h3>
        <p>{product.priceText || (displayPrice != null ? `${displayPrice.toLocaleString("ru-RU")} ₽` : "Цена в магазине")}</p>
        <small>{product.category || "Без категории"}</small>
        <div className="chips">
          {product.sizes.map((size) => (
            <span key={size.id}>{size.value}</span>
          ))}
          {product.colors.map((color) => (
            <span key={color.id}>{color.name}</span>
          ))}
        </div>
        <strong>{statusMap[product.status]}</strong>
      </div>
    </Link>
  );
}
