import {
  CancelCircleIcon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Edit02Icon,
  HelpCircleIcon,
  Image01Icon,
  Location01Icon,
  MoreHorizontalIcon,
  Share08Icon,
  Store01Icon,
  ViewIcon
} from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { PriceModal } from "../components/dashboard/PriceModal";
import { ProductActionsModal } from "../components/dashboard/ProductActionsModal";
import { ProductPhoto, photoSources } from "../components/ProductPhoto";
import {
  ContactButton,
  FavoriteButton,
  MobileActionBar,
  MobileContactBar,
  PhotoViewer,
  ShareButton,
  ShareProductModal,
  StorefrontFooter
} from "../components/storefront";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { useFavicon } from "../hooks/useFavicon";
import { useFavorites } from "../hooks/useFavorites";
import type { Product, Store } from "../types/models";
import { hasContacts, mapsUrl } from "../utils/contact";
import { isNewProduct, sortSizes } from "../utils/format";
import {
  BackLink,
  Badge,
  Button,
  ButtonLink,
  Card,
  Chip,
  ChipGroup,
  ColorSwatch,
  ConfirmModal,
  EmptyState,
  Icon,
  LoadingState,
  Notice,
  Page,
  SectionLabel,
  cx,
  useToast,
  type IconSvgElement
} from "../ui";
import styles from "./PublicProductPage.module.css";

/** How wide the main photo is shown: the same for the photo and for preloading the others. */
const MAIN_PHOTO_SIZES = "(min-width: 720px) 55vw, 100vw";

const AVAILABILITY_CONFIG: Record<Product["status"], { icon: IconSvgElement; label: string; tone: string }> = {
  AVAILABLE: { icon: CheckmarkCircle02Icon, label: "в наличии", tone: styles.available },
  NOT_AVAILABLE: { icon: CancelCircleIcon, label: "нет в наличии", tone: styles.unavailable },
  CHECK_IN_STORE: { icon: HelpCircleIcon, label: "уточнить в магазине", tone: styles.unclear }
};

export function PublicProductPage() {
  const { storeSlug = "", productId = "" } = useParams();
  // viewerIsOwner: the store's owner is looking — share buttons instead of the buyer's «Спросить».
  const [data, setData] = useState<{ store: Store; product: Product; viewerIsOwner?: boolean }>();
  const [error, setError] = useState("");
  const [firstChoice, setFirstChoice] = useState<"color" | "size" | null>(null);
  const [selectedColor, setSelectedColor] = useState("");
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedImageId, setSelectedImageId] = useState("");
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isTogglingVisibility, setIsTogglingVisibility] = useState(false);
  // The owner's «Ещё действия» and the windows it leads to.
  const [ownerWindow, setOwnerWindow] = useState<"actions" | "price" | "delete" | null>(null);
  const navigate = useNavigate();
  const toast = useToast();
  const favorites = useFavorites(storeSlug);

  useDocumentMeta(data ? `${data.product.title} — ${data.store.name}` : null, data?.product.description);
  useFavicon(data?.store.logoUrl);

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

  // The other photos load in the background at the main photo's size: picking one shows it at once.
  useEffect(() => {
    for (const image of data?.product.images.slice(1) ?? []) {
      const { src, srcSet } = photoSources(image.url);
      const preload = new Image();
      preload.sizes = MAIN_PHOTO_SIZES;
      if (srcSet) preload.srcset = srcSet;
      preload.src = src;
    }
  }, [data]);

  if (error) {
    return (
      <Page>
        <EmptyState title="Товар недоступен" description={error} />
      </Page>
    );
  }
  if (!data) {
    return (
      <Page>
        <LoadingState />
      </Page>
    );
  }
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
  const sizeOptions = sortSizes([...new Set(variants.map((variant) => variant.size))]);
  const availableColorNames = new Set(
    variants.filter((variant) => !selectedSize || variant.size === selectedSize).map((variant) => variant.colorName)
  );
  const availableSizes = new Set(
    variants.filter((variant) => !selectedColor || variant.colorName === selectedColor).map((variant) => variant.size)
  );
  const availability = AVAILABILITY_CONFIG[product.status];
  const productUrl = `${window.location.origin}/m/${storeSlug}/p/${product.id}`;
  const askMessage = [
    `Здравствуйте! Интересует «${product.title}»`,
    [selectedColor && `цвет: ${selectedColor}`, selectedSize && `размер: ${selectedSize}`].filter(Boolean).join(", "),
    "Есть в наличии?",
    productUrl
  ]
    .filter(Boolean)
    .join("\n");
  const isFavorite = favorites.has(product.id);

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

  /** «Скрыть с витрины» / «Показать на витрине» — the owner's own product, right from its page. */
  async function toggleVisibility() {
    if (!data) return;
    const isVisible = !data.product.isVisible;
    setIsTogglingVisibility(true);
    try {
      await api.patch(`/owner/stores/${data.store.id}/products/${data.product.id}`, { isVisible: isVisible ? 1 : 0 });
      setData({ ...data, product: { ...data.product, isVisible: isVisible ? 1 : 0 } });
      toast.show(isVisible ? "Товар снова на витрине" : "Товар скрыт с витрины", { tone: "success" });
    } catch (err: any) {
      toast.show(err?.response?.data?.message ?? "Не удалось сохранить. Попробуйте ещё раз.", { tone: "danger" });
    } finally {
      setIsTogglingVisibility(false);
    }
  }

  function resetVariantSelection() {
    setFirstChoice(null);
    setSelectedColor("");
    setSelectedSize("");
  }

  return (
    <Page className={styles.page}>
      <div className={styles.back}>
        <BackLink to={`/m/${storeSlug}`}>{store.name}</BackLink>
      </div>
      <div className={styles.gallery}>
        {selectedImage ? (
          <>
            <button type="button" className={styles.galleryMain} aria-label="Открыть фото на весь экран" onClick={() => setIsViewerOpen(true)}>
              <ProductPhoto key={selectedImage.id} src={selectedImage.url} sizes={MAIN_PHOTO_SIZES} alt={product.title} loading="eager" />
            </button>
            {product.images.length > 1 && (
              <div className={styles.thumbs}>
                {product.images.map((image) => (
                  <button
                    type="button"
                    key={image.id}
                    className={cx(styles.thumb, image.id === selectedImage.id && styles.thumbActive)}
                    aria-label="Показать фото"
                    aria-pressed={image.id === selectedImage.id}
                    onClick={() => setSelectedImageId(image.id)}
                  >
                    <ProductPhoto src={image.url} sizes="96px" />
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className={styles.galleryEmpty}>
            <Icon icon={Image01Icon} size="lg" strokeWidth={1.6} />
          </div>
        )}
      </div>
      <Card as="article" padding="lg" className={styles.info}>
        <div className={styles.titleRow}>
          <div className={styles.titleText}>
            {isNewProduct(product.createdAt) && product.status !== "NOT_AVAILABLE" && (
              <Badge tone="accent" className={styles.newBadge}>
                Новинка
              </Badge>
            )}
            <h1 className={styles.title}>{product.title}</h1>
          </div>
          <div className={styles.titleActions}>
            <FavoriteButton active={isFavorite} onToggle={() => favorites.toggle(product.id)} />
            <ShareButton url={productUrl} title={product.title} variant="neutral" className={styles.share} />
          </div>
        </div>
        <p className={styles.price}>{product.priceText ? `Цена: ${displayedPriceText}` : displayedPriceText}</p>
        {product.description && <p className={styles.description}>{product.description}</p>}
        {variants.length ? (
          <div className={styles.variants}>
            <div className={styles.variantGroup}>
              <SectionLabel>Цвет</SectionLabel>
              <ChipGroup label="Цвет">
                {colorOptions.map((color) => (
                  <ColorSwatch
                    key={color.colorName}
                    color={color.colorHex}
                    label={color.colorName}
                    size="lg"
                    selected={color.colorName === selectedColor}
                    disabled={Boolean(selectedSize) && !availableColorNames.has(color.colorName)}
                    onClick={() => chooseColor(color.colorName)}
                  />
                ))}
              </ChipGroup>
            </div>
            <div className={styles.variantGroup}>
              <SectionLabel>Размер</SectionLabel>
              <ChipGroup label="Размер">
                {sizeOptions.map((size) => (
                  <Chip
                    key={size}
                    selected={size === selectedSize}
                    disabled={Boolean(selectedColor) && !availableSizes.has(size)}
                    onClick={() => chooseSize(size)}
                  >
                    {size}
                  </Chip>
                ))}
              </ChipGroup>
            </div>
            <Button variant="ghost" size="sm" className={styles.reset} onClick={resetVariantSelection} disabled={!firstChoice}>
              Сбросить выбор
            </Button>
          </div>
        ) : (
          (product.sizes.length > 0 || product.colors.length > 0) && (
            <div className={styles.staticAttrs}>
              {sortSizes(product.sizes.map((s) => s.value)).map((size) => (
                <Badge key={size}>{size}</Badge>
              ))}
              {product.colors.map((c) => (
                <Badge key={c.id}>{c.name}</Badge>
              ))}
            </div>
          )
        )}
        <p className={cx(styles.availability, availability.tone)}>
          <Icon icon={availability.icon} size="sm" />
          <strong>Наличие:</strong> {availability.label}
        </p>
        {data.viewerIsOwner ? (
          <div className={styles.ownerShare}>
            {product.blockedAt ? (
              <Notice tone="danger" title="Снят с витрины администратором">
                {product.blockedReason ? `${product.blockedReason} ` : ""}Покупатели не видят этот товар. Замените фото и напишите администратору, чтобы вернуть его.
              </Notice>
            ) : product.isVisible ? (
              <Button variant="primary" size="lg" block icon={Share08Icon} onClick={() => setIsShareOpen(true)}>
                Поделиться в соцсетях
              </Button>
            ) : (
              <Notice tone="warning" title="Скрыт с витрины">
                Покупатели не видят этот товар. Вам он открывается, потому что вы владелец.
              </Notice>
            )}
            <div className={styles.ownerActions}>
              <ButtonLink variant="secondary" icon={Edit02Icon} to={`/dashboard/stores/${store.id}/products/${product.id}/edit`}>
                Редактировать
              </ButtonLink>
              <Button variant="secondary" icon={MoreHorizontalIcon} onClick={() => setOwnerWindow("actions")}>
                Ещё действия
              </Button>
            </div>
            <small>Это ваш товар. Покупатели видят здесь «Связаться»: WhatsApp, Telegram, звонок и другие ваши контакты.</small>
          </div>
        ) : hasContacts(store) ? (
          <ContactButton block store={store} storeSlug={storeSlug} productId={product.id} message={askMessage} />
        ) : (
          <Notice tone="neutral">Магазин не указал контакты — загляните к ним лично{store.address ? ` по адресу: ${store.address}` : ""}.</Notice>
        )}
        <div className={styles.store}>
          <Link to={`/m/${storeSlug}`} className={styles.storeName}>
            <Icon icon={Store01Icon} size="sm" />
            {store.name}
          </Link>
          {store.address && (
            <a href={mapsUrl(store.address)} target="_blank" rel="noreferrer" className={styles.storeFact}>
              <Icon icon={Location01Icon} size="sm" />
              {store.address}
            </a>
          )}
          {store.workingHours && (
            <span className={styles.storeFact}>
              <Icon icon={Clock01Icon} size="sm" />
              {store.workingHours}
            </span>
          )}
        </div>
      </Card>
      {isViewerOpen && selectedImage && (
        <PhotoViewer
          images={product.images.map((image) => image.url)}
          index={product.images.indexOf(selectedImage)}
          alt={product.title}
          onIndexChange={(index) => setSelectedImageId(product.images[index].id)}
          onClose={() => setIsViewerOpen(false)}
        />
      )}
      {isShareOpen && (
        <ShareProductModal
          store={store}
          title={product.title}
          priceText={displayedPriceText}
          photoUrl={selectedImage?.url ?? null}
          productUrl={productUrl}
          onClose={() => setIsShareOpen(false)}
        />
      )}
      {data.viewerIsOwner && ownerWindow === "actions" && (
        <ProductActionsModal
          product={product}
          storeId={store.id}
          onClose={() => setOwnerWindow(null)}
          onChanged={(updated) => setData({ ...data, product: { ...product, ...updated } })}
          onEditPrice={() => setOwnerWindow("price")}
          onDelete={() => setOwnerWindow("delete")}
        />
      )}
      {data.viewerIsOwner && ownerWindow === "price" && (
        <PriceModal
          product={product}
          storeId={store.id}
          onClose={() => setOwnerWindow(null)}
          onSaved={(updated) => setData({ ...data, product: { ...product, ...updated } })}
        />
      )}
      {data.viewerIsOwner && ownerWindow === "delete" && (
        <ConfirmModal
          danger
          title="Удалить товар?"
          description={`Товар «${product.title}» исчезнет из кабинета и с витрины. Если товар просто закончился, лучше отметьте «Нет в наличии» или скройте его.`}
          confirmLabel="Удалить"
          onCancel={() => setOwnerWindow(null)}
          onConfirm={async () => {
            try {
              await api.delete(`/owner/stores/${store.id}/products/${product.id}`);
              toast.show("Товар удалён", { tone: "success" });
              navigate(`/dashboard/stores/${store.id}`, { replace: true });
            } catch (err: any) {
              toast.show(err?.response?.data?.message ?? "Не удалось удалить. Попробуйте ещё раз.", { tone: "danger" });
              setOwnerWindow(null);
            }
          }}
        />
      )}
      <StorefrontFooter />
      {data.viewerIsOwner ? (
        <MobileActionBar>
          {product.blockedAt ? (
            // Taken off by the admin: a shared link would show buyers «Товар недоступен».
            <Button variant="secondary" size="lg" block icon={MoreHorizontalIcon} onClick={() => setOwnerWindow("actions")}>
              Ещё действия
            </Button>
          ) : product.isVisible ? (
            <Button variant="primary" size="lg" block icon={Share08Icon} onClick={() => setIsShareOpen(true)}>
              Поделиться в соцсетях
            </Button>
          ) : (
            <Button variant="primary" size="lg" block icon={ViewIcon} loading={isTogglingVisibility} onClick={() => void toggleVisibility()}>
              Показать на витрине
            </Button>
          )}
        </MobileActionBar>
      ) : (
        <MobileContactBar store={store} storeSlug={storeSlug} productId={product.id} message={askMessage} />
      )}
    </Page>
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
