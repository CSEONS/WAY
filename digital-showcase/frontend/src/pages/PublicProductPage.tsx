import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import {
  Call02Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Image01Icon,
  TelegramIcon,
  WhatsappIcon
} from "@hugeicons/core-free-icons";
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

  if (error) return <section className="page page-product-detail">{error}</section>;
  if (!data) return <section className="page page-product-detail">Загрузка...</section>;
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
    <section className="page page-product-detail">
      <div className="product-gallery">
        {selectedImage ? (
          <>
            <div className="product-gallery-main">
              <img src={selectedImage.url} alt={product.title} />
            </div>
            <div className="product-gallery-thumbs">
              {product.images.map((image) => (
                <button type="button" key={image.id} className={image.id === selectedImage.id ? "is-active" : ""} onClick={() => setSelectedImageId(image.id)}>
                  <img src={image.url} alt={product.title} />
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="product-gallery-empty">
            <HugeiconsIcon icon={Image01Icon} size={28} strokeWidth={1.6} />
          </div>
        )}
      </div>
      <article className="product-info-panel">
        <h1>{product.title}</h1>
        <p className="product-price">{product.priceText ? `Цена: ${displayedPriceText}` : displayedPriceText}</p>
        <p className="product-description">{product.description}</p>
        {variants.length ? (
          <div>
            <div className="variant-group">
              <div className="variant-group-head">
                <strong>Цвет</strong>
                {firstChoice === "color" && <small>выбран первым</small>}
              </div>
              <div className="variant-options">
                {colorOptions.map((color) => (
                  <button
                    type="button"
                    key={color.colorName}
                    className={`variant-chip${color.colorName === selectedColor ? " is-selected" : ""}`}
                    onClick={() => chooseColor(color.colorName)}
                  >
                    {color.colorHex && <span className="swatch" style={{ background: color.colorHex }} />}
                    {color.colorName}
                  </button>
                ))}
              </div>
            </div>
            <div className="variant-group">
              <div className="variant-group-head">
                <strong>Размер</strong>
                {firstChoice === "size" && <small>выбран первым</small>}
              </div>
              <div className="variant-options">
                {sizeOptions.map((size) => (
                  <button
                    type="button"
                    key={size}
                    className={`variant-chip${size === selectedSize ? " is-selected" : ""}`}
                    onClick={() => chooseSize(size)}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={resetVariantSelection} disabled={!firstChoice}>
                Сбросить выбор
              </button>
            </div>
          </div>
        ) : (
          <div className="static-attrs">
            {product.sizes.map((s) => (
              <span key={s.id} className="badge badge-neutral">{s.value}</span>
            ))}
            {product.colors.map((c) => (
              <span key={c.id} className="badge badge-neutral">{c.name}</span>
            ))}
          </div>
        )}
        <p className="product-availability">
          <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} strokeWidth={1.8} />
          <strong>Наличие:</strong> {product.status === "AVAILABLE" ? "в наличии" : product.status === "NOT_AVAILABLE" ? "нет в наличии" : "уточнить в магазине"}
        </p>
        <div className="store-contact-panel">
          <h2>{store.name}</h2>
          <p>{[store.address, store.phone, store.whatsapp, store.telegram].filter(Boolean).join(" · ")}</p>
          <button type="button" className="btn btn-primary" onClick={() => setContactModalOpen(true)}>Связаться с магазином</button>
        </div>
      </article>
      {contactModalOpen && (
        <div className="modal-backdrop" role="presentation" onPointerDown={(event) => event.currentTarget === event.target && setContactModalOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-head">
              <div className="modal-title">
                <h2>Выберите способ связи</h2>
                <p>{store.name}</p>
              </div>
              <button type="button" className="btn-icon btn-ghost" aria-label="Закрыть" onClick={() => setContactModalOpen(false)}>
                <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={1.8} />
              </button>
            </div>
            <div className="modal-body">
              <ContactOption icon={Call02Icon} label="Позвонить" value={store.phone} href={store.phone ? `tel:${store.phone}` : undefined} />
              <ContactOption icon={WhatsappIcon} label="WhatsApp" value={store.whatsapp} href={store.whatsapp ? `https://wa.me/${store.whatsapp.replace(/\D/g, "")}` : undefined} />
              <ContactOption icon={TelegramIcon} label="Telegram" value={store.telegram} href={store.telegram ? (store.telegram.startsWith("http") ? store.telegram : `https://t.me/${store.telegram.replace("@", "")}`) : undefined} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ContactOption({
  icon,
  label,
  value,
  href
}: {
  icon: IconSvgElement;
  label: string;
  value?: string | null;
  href?: string;
}) {
  const content = (
    <>
      <span className="contact-option-icon">
        <HugeiconsIcon icon={icon} size={18} strokeWidth={1.8} />
      </span>
      <span>
        <strong>{label}</strong>
        <small>{href ? value : "Не указан владельцем"}</small>
      </span>
    </>
  );
  if (!href) return <span className="contact-option" aria-disabled="true">{content}</span>;
  return (
    <a className="contact-option" href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
      {content}
    </a>
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

