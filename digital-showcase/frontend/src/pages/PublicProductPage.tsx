import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client";
import type { Product, Store } from "../types/models";

export function PublicProductPage() {
  const { storeSlug = "", productId = "" } = useParams();
  const [data, setData] = useState<{ store: Store; product: Product }>();
  const [error, setError] = useState("");
  const [firstChoice, setFirstChoice] = useState<"color" | "size" | null>(null);
  const [selectedColor, setSelectedColor] = useState("");
  const [selectedSize, setSelectedSize] = useState("");

  useEffect(() => {
    api
      .get(`/public/stores/${storeSlug}/products/${productId}`)
      .then((res) => {
        setData(res.data);
        resetVariantSelection();
      })
      .catch((err) => setError(err.response?.data?.message ?? "Товар недоступен"));
  }, [storeSlug, productId]);

  const contactHref = useMemo(() => {
    const store = data?.store;
    if (!store) return "#";
    if (store.whatsapp) return `https://wa.me/${store.whatsapp.replace(/\D/g, "")}`;
    if (store.telegram) return store.telegram.startsWith("http") ? store.telegram : `https://t.me/${store.telegram.replace("@", "")}`;
    return store.phone ? `tel:${store.phone}` : "#";
  }, [data]);

  if (error) return <section className="empty">{error}</section>;
  if (!data) return <section className="empty">Загрузка...</section>;
  const { store, product } = data;
  const variants = product.variants ?? [];
  const selectedVariant = variants.find((variant) => variant.colorName === selectedColor && variant.size === selectedSize);
  const displayedPrice = selectedVariant?.price ?? product.price;
  const displayedPriceText = selectedVariant?.price != null ? `${selectedVariant.price.toLocaleString("ru-RU")} ₽` : product.priceText || (displayedPrice != null ? `${displayedPrice.toLocaleString("ru-RU")} ₽` : "Цена в магазине");
  const colorOptions = uniqueBy(
    variants.filter((variant) => !selectedSize || firstChoice !== "size" || variant.size === selectedSize),
    (variant) => variant.colorName
  );
  const sizeOptions = [...new Set(variants.filter((variant) => !selectedColor || firstChoice !== "color" || variant.colorName === selectedColor).map((variant) => variant.size))];

  function chooseColor(colorName: string) {
    const nextFirstChoice = firstChoice ?? "color";
    const nextSize = nextFirstChoice === "color" && selectedSize && !variants.some((variant) => variant.colorName === colorName && variant.size === selectedSize) ? "" : selectedSize;
    setFirstChoice(nextFirstChoice);
    setSelectedColor(colorName);
    setSelectedSize(nextSize);
  }

  function chooseSize(size: string) {
    const nextFirstChoice = firstChoice ?? "size";
    const nextColor = nextFirstChoice === "size" && selectedColor && !variants.some((variant) => variant.size === size && variant.colorName === selectedColor) ? "" : selectedColor;
    setFirstChoice(nextFirstChoice);
    setSelectedSize(size);
    setSelectedColor(nextColor);
  }

  function resetVariantSelection() {
    setFirstChoice(null);
    setSelectedColor("");
    setSelectedSize("");
  }

  return (
    <section className="product-page">
      <div className="gallery">
        {product.images.length ? product.images.map((image) => <img key={image.id} src={image.url} alt={product.title} />) : <div className="placeholder">Фото скоро</div>}
      </div>
      <article>
        <h1>{product.title}</h1>
        <p className="price">{displayedPriceText}</p>
        <p>{product.description}</p>
        {variants.length ? (
          <div className="product-options">
            <div className="option-group">
              <div className="option-head">
                <strong>Цвет</strong>
                {firstChoice === "color" && <small>выбран первым</small>}
              </div>
              <div className="choice-list">
                {colorOptions.map((color) => (
                  <button className={selectedColor === color.colorName ? "choice-button active" : "choice-button"} type="button" key={color.colorName} onClick={() => chooseColor(color.colorName)}>
                    {color.colorHex && <span className="color-swatch" style={{ background: color.colorHex }} />}
                    {color.colorName}
                  </button>
                ))}
              </div>
            </div>
            <div className="option-group">
              <div className="option-head">
                <strong>Размер</strong>
                {firstChoice === "size" && <small>выбран первым</small>}
              </div>
              <div className="choice-list">
                {sizeOptions.map((size) => (
                  <button className={selectedSize === size ? "choice-button active" : "choice-button"} type="button" key={size} onClick={() => chooseSize(size)}>
                    {size}
                  </button>
                ))}
              </div>
            </div>
            {firstChoice && (
              <button className="button-link" type="button" onClick={resetVariantSelection}>
                Сбросить выбор
              </button>
            )}
          </div>
        ) : (
          <div className="chips">
            {product.sizes.map((s) => (
              <span key={s.id}>{s.value}</span>
            ))}
            {product.colors.map((c) => (
              <span key={c.id}>{c.name}</span>
            ))}
          </div>
        )}
        <p>Статус: {product.status === "AVAILABLE" ? "в наличии" : product.status === "NOT_AVAILABLE" ? "нет в наличии" : "уточнить в магазине"}</p>
        <div className="contact-box">
          <h2>{store.name}</h2>
          <p>{[store.address, store.phone, store.whatsapp, store.telegram].filter(Boolean).join(" · ")}</p>
          <a className="primary button-link" href={contactHref}>Связаться с магазином</a>
        </div>
      </article>
    </section>
  );
}

function uniqueBy<T>(items: T[], getKey: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
