import { useEffect, useState } from "react";
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
  const [selectedImageId, setSelectedImageId] = useState("");
  const [contactModalOpen, setContactModalOpen] = useState(false);

  useEffect(() => {
    api
      .get(`/public/stores/${storeSlug}/products/${productId}`)
      .then((res) => {
        setData(res.data);
        setSelectedImageId(res.data.product.images[0]?.id ?? "");
        resetVariantSelection();
      })
      .catch((err) => setError(err.response?.data?.message ?? "Товар недоступен"));
  }, [storeSlug, productId]);

  if (error) return <section className="empty">{error}</section>;
  if (!data) return <section className="empty">Загрузка...</section>;
  const { store, product } = data;
  const selectedImage = product.images.find((image) => image.id === selectedImageId) ?? product.images[0];
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
      <div className="product-slider">
        {selectedImage ? (
          <>
            <div className="product-slider-main">
              <img src={selectedImage.url} alt={product.title} />
            </div>
            <div className="product-slider-thumbs">
              {product.images.map((image) => (
                <button className={selectedImage.id === image.id ? "active" : ""} type="button" key={image.id} onClick={() => setSelectedImageId(image.id)}>
                  <img src={image.url} alt={product.title} />
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="placeholder">Фото скоро</div>
        )}
      </div>
      <article>
        <h1>{product.title}</h1>
        <p className="price">{product.priceText ? `Цена: ${displayedPriceText}` : displayedPriceText}</p>
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
            <div className="reset-choice-slot">
              <button className={firstChoice ? "button-link danger" : "button-link danger hidden"} type="button" onClick={resetVariantSelection} disabled={!firstChoice}>
                Сбросить выбор
              </button>
            </div>
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
        <p className="availability-label"><strong>Наличие:</strong> {product.status === "AVAILABLE" ? "в наличии" : product.status === "NOT_AVAILABLE" ? "нет в наличии" : "уточнить в магазине"}</p>
        <div className="contact-box">
          <h2>{store.name}</h2>
          <p>{[store.address, store.phone, store.whatsapp, store.telegram].filter(Boolean).join(" · ")}</p>
          <button className="primary" type="button" onClick={() => setContactModalOpen(true)}>Связаться с магазином</button>
        </div>
      </article>
      {contactModalOpen && (
        <div className="modal-backdrop" role="presentation" onPointerDown={(event) => event.currentTarget === event.target && setContactModalOpen(false)}>
          <div className="modal contact-modal" role="dialog" aria-modal="true" aria-labelledby="contact-title">
            <div className="modal-head">
              <div><h2 id="contact-title">Выберите способ связи</h2><p>{store.name}</p></div>
              <button type="button" aria-label="Закрыть" onClick={() => setContactModalOpen(false)}>×</button>
            </div>
            <div className="contact-options">
              <ContactOption label="Позвонить" value={store.phone} href={store.phone ? `tel:${store.phone}` : undefined} />
              <ContactOption label="WhatsApp" value={store.whatsapp} href={store.whatsapp ? `https://wa.me/${store.whatsapp.replace(/\D/g, "")}` : undefined} />
              <ContactOption label="Telegram" value={store.telegram} href={store.telegram ? (store.telegram.startsWith("http") ? store.telegram : `https://t.me/${store.telegram.replace("@", "")}`) : undefined} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ContactOption({ label, value, href }: { label: string; value?: string | null; href?: string }) {
  if (!href) return <span className="contact-option disabled" aria-disabled="true"><strong>{label}</strong><small>Не указан владельцем</small></span>;
  return <a className="contact-option" href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer"><strong>{label}</strong><small>{value}</small></a>;
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
