import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import {
  Call02Icon,
  Cancel01Icon,
  CancelCircleIcon,
  CheckmarkCircle02Icon,
  HelpCircleIcon,
  Image01Icon,
  TelegramIcon,
  WhatsappIcon
} from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client";
import type { Product, Store } from "../types/models";

const AVAILABILITY_CONFIG: Record<Product["status"], { icon: IconSvgElement; label: string; tone: string }> = {
  AVAILABLE: { icon: CheckmarkCircle02Icon, label: "в наличии", tone: "is-available" },
  NOT_AVAILABLE: { icon: CancelCircleIcon, label: "нет в наличии", tone: "is-unavailable" },
  CHECK_IN_STORE: { icon: HelpCircleIcon, label: "уточнить в магазине", tone: "is-unclear" }
};

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
  const variantPrices = variants.map((variant) => variant.price).filter((price): price is number => price != null);
  const minVariantPrice = variantPrices.length ? Math.min(...variantPrices) : null;
  const maxVariantPrice = variantPrices.length ? Math.max(...variantPrices) : null;
  const priceRangeText =
    minVariantPrice != null && maxVariantPrice != null
      ? minVariantPrice === maxVariantPrice
        ? `${minVariantPrice.toLocaleString("ru-RU")} ₽`
        : `${minVariantPrice.toLocaleString("ru-RU")}–${maxVariantPrice.toLocaleString("ru-RU")} ₽`
      : null;
  const displayedPrice = selectedVariant?.price ?? product.price;
  const displayedPriceText = selectedVariant?.price != null
    ? `${selectedVariant.price.toLocaleString("ru-RU")} ₽`
    : priceRangeText || product.priceText || (displayedPrice != null ? `${displayedPrice.toLocaleString("ru-RU")} ₽` : "Цена в магазине");
  const colorOptions = uniqueBy(variants, (variant) => variant.colorName);
  const sizeOptions = [...new Set(variants.map((variant) => variant.size))];
  const availableColorNames = new Set(
    variants.filter((variant) => !selectedSize || variant.size === selectedSize).map((variant) => variant.colorName)
  );
  const availableSizes = new Set(
    variants.filter((variant) => !selectedColor || variant.colorName === selectedColor).map((variant) => variant.size)
  );

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
              </div>
              <div className="variant-chip-row">
                {colorOptions.map((color) => (
                  <button
                    type="button"
                    key={color.colorName}
                    className={`variant-color-chip${color.colorName === selectedColor ? " is-selected" : ""}`}
                    onClick={() => chooseColor(color.colorName)}
                    disabled={Boolean(selectedSize) && !availableColorNames.has(color.colorName)}
                    title={color.colorName}
                  >
                    <span className="variant-color-chip-swatch" style={{ background: color.colorHex ?? "#d8e5e8" }} />
                  </button>
                ))}
              </div>
            </div>
            <div className="variant-group">
              <div className="variant-group-head">
                <strong>Размер</strong>
              </div>
              <div className="variant-chip-row">
                {sizeOptions.map((size) => (
                  <button
                    type="button"
                    key={size}
                    className={`variant-size-chip${size === selectedSize ? " is-selected" : ""}`}
                    onClick={() => chooseSize(size)}
                    disabled={Boolean(selectedColor) && !availableSizes.has(size)}
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
        <p className={`product-availability ${AVAILABILITY_CONFIG[product.status].tone}`}>
          <HugeiconsIcon icon={AVAILABILITY_CONFIG[product.status].icon} size={16} strokeWidth={1.8} />
          <strong>Наличие:</strong> {AVAILABILITY_CONFIG[product.status].label}
        </p>
        <button type="button" className="btn btn-primary" onClick={() => setContactModalOpen(true)}>Связаться с магазином</button>
      </article>
      {contactModalOpen && (
        <div className="modal-backdrop" role="presentation" onPointerDown={(event) => event.currentTarget === event.target && setContactModalOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-head">
              <div className="modal-title">
                <h2>Выберите способ связи</h2>
                <p>{store.name}</p>
                {store.address && <p className="modal-subtitle-muted">{store.address}</p>}
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

