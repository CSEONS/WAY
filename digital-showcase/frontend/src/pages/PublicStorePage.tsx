import { ArrowDown01Icon, FavouriteIcon, PreferenceHorizontalIcon, Search01Icon } from "@hugeicons/core-free-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigationType, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { ProductCard } from "../components/ProductCard";
import { MobileContactBar, StoreHeader } from "../components/storefront";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { useFavorites } from "../hooks/useFavorites";
import type { Product, Store, StoreFacets } from "../types/models";
import { plural, sortSizes } from "../utils/format";
import {
  Button,
  Card,
  Chip,
  ChipGroup,
  ColorSwatch,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Page,
  SectionLabel,
  Select,
  Spinner,
  cx
} from "../ui";
import styles from "./PublicStorePage.module.css";

const PAGE_SIZE = 24;
const SEARCH_DELAY_MS = 300;
const SORTS = ["new", "price-asc", "price-desc"] as const;
type Sort = (typeof SORTS)[number];

/** Everything that picks which products are shown. Lives in the URL, so a filtered link can be shared. */
interface Query {
  q: string;
  category: string;
  size: string;
  color: string;
  sort: Sort;
  favorites: boolean;
}

function readQuery(params: URLSearchParams): Query {
  const sort = params.get("sort");
  return {
    q: params.get("q") ?? "",
    category: params.get("category") ?? "",
    size: params.get("size") ?? "",
    color: params.get("color") ?? "",
    sort: SORTS.find((value) => value === sort) ?? "new",
    favorites: params.get("fav") === "1"
  };
}

interface Listing {
  products: Product[];
  total: number;
  status: "loading" | "ready" | "loading-more" | "error";
}

// The last catalog shown, with every «Показать ещё» page: «Назад» from a
// product returns to the same list instantly instead of the first page.
let snapshot: { key: string; store: Store; facets: StoreFacets | null; products: Product[]; total: number } | null = null;

export function PublicStorePage() {
  const { storeSlug = "" } = useParams();
  const navigationType = useNavigationType();
  const [params, setParams] = useSearchParams();
  const query = readQuery(params);
  const favorites = useFavorites(storeSlug);
  const favoriteIds = query.favorites ? favorites.ids.join(",") : "";
  const listKey = `${storeSlug}?${params.toString()}#${favoriteIds}`;

  const restored = useRef(navigationType === "POP" && snapshot?.key === listKey ? snapshot : null).current;
  const [store, setStore] = useState<Store | undefined>(restored?.store);
  const [storeError, setStoreError] = useState<"" | "not-found" | "unavailable" | "network">("");
  const [attempt, setAttempt] = useState(0);
  const [facets, setFacets] = useState<StoreFacets | null>(restored?.facets ?? null);
  const [listing, setListing] = useState<Listing>(
    restored ? { products: restored.products, total: restored.total, status: "ready" } : { products: [], total: 0, status: "loading" }
  );
  const [search, setSearch] = useState(query.q);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draft, setDraft] = useState({ size: query.size, color: query.color });
  const requestId = useRef(0);
  const skipFirstLoad = useRef(Boolean(restored));

  useDocumentMeta(store?.name, store?.description);

  useEffect(() => {
    if (restored?.store.slug === storeSlug) return;
    setStore(undefined);
    setStoreError("");
    api
      .get<Store>(`/public/stores/${storeSlug}`)
      .then((res) => setStore(res.data))
      .catch((err) => {
        const status = err.response?.status;
        setStoreError(status === 404 ? "not-found" : status === 403 ? "unavailable" : "network");
      });
    api
      .get<StoreFacets>(`/public/stores/${storeSlug}/filters`)
      .then((res) => setFacets(res.data))
      .catch(() => setFacets(null));
  }, [storeSlug, restored, attempt]);

  const load = useCallback(
    async (offset: number) => {
      const id = ++requestId.current;
      if (query.favorites && !favoriteIds) {
        setListing({ products: [], total: 0, status: "ready" });
        return;
      }
      setListing((current) => ({ ...current, status: offset ? "loading-more" : "loading" }));
      try {
        const res = await api.get<Product[]>(`/public/stores/${storeSlug}/products`, {
          params: {
            q: query.q || undefined,
            category: query.category || undefined,
            size: query.size || undefined,
            color: query.color || undefined,
            sort: query.sort,
            ids: query.favorites ? favoriteIds : undefined,
            limit: PAGE_SIZE,
            offset
          }
        });
        if (id !== requestId.current) return;
        const total = Number(res.headers["x-total-count"] ?? res.data.length);
        setListing((current) => ({ products: offset ? [...current.products, ...res.data] : res.data, total, status: "ready" }));
      } catch {
        if (id !== requestId.current) return;
        setListing((current) => ({ ...current, status: "error" }));
      }
    },
    // listKey covers every field of the query and the favorites list.
    [listKey]
  );

  useEffect(() => {
    if (skipFirstLoad.current) {
      skipFirstLoad.current = false;
      return;
    }
    void load(0);
  }, [load]);

  useEffect(() => {
    if (store && listing.status === "ready") snapshot = { key: listKey, store, facets, products: listing.products, total: listing.total };
  }, [listKey, store, facets, listing]);

  const updateQuery = useCallback(
    (patch: Partial<Query>) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [field, value] of Object.entries(patch)) {
            const name = field === "favorites" ? "fav" : field;
            if (!value || (field === "sort" && value === "new")) next.delete(name);
            else next.set(name, value === true ? "1" : String(value));
          }
          return next;
        },
        { replace: true }
      );
    },
    [setParams]
  );

  // Search as you type, once typing pauses. Always across the whole catalog, not just favorites.
  useEffect(() => {
    if (search.trim() === query.q) return;
    const timer = window.setTimeout(() => updateQuery({ q: search.trim(), favorites: false }), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [search, query.q, updateQuery]);

  useEffect(() => setDraft({ size: query.size, color: query.color }), [query.size, query.color]);

  if (storeError) {
    return (
      <Page>
        {storeError === "network" ? (
          <ErrorState title="Не удалось открыть магазин" onRetry={() => setAttempt((current) => current + 1)} />
        ) : (
          <EmptyState
            title={storeError === "unavailable" ? "Магазин недоступен" : "Магазин не найден"}
            description={
              storeError === "unavailable" ? "Магазин временно не принимает посетителей. Попробуйте зайти позже." : "Проверьте ссылку: возможно, в ней опечатка."
            }
          />
        )}
      </Page>
    );
  }
  if (!store) {
    return (
      <Page>
        <LoadingState />
      </Page>
    );
  }

  const categories = facets?.categories ?? [];
  const sizes = sortSizes(facets?.sizes ?? []);
  const colors = facets?.colors ?? [];
  const filterCount = [query.size, query.color].filter(Boolean).length;
  const isFiltered = Boolean(query.q || query.category || filterCount);
  const favoriteCount = favorites.ids.length;

  function resetAll() {
    setSearch("");
    updateQuery({ q: "", category: "", size: "", color: "", favorites: false });
  }

  return (
    <Page className={styles.page}>
      <StoreHeader store={store} />

      <section className={styles.catalog} aria-label="Каталог">
        <Card padding="sm" className={styles.filters}>
          <Input
            type="search"
            icon={Search01Icon}
            aria-label="Поиск по каталогу"
            placeholder="Поиск: платье, джинсы…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <ChipGroup scroll label="Разделы каталога">
            {(sizes.length > 0 || colors.length > 0) && (
              <Chip
                icon={PreferenceHorizontalIcon}
                iconEnd={ArrowDown01Icon}
                count={filterCount}
                selected={filterCount > 0}
                className={cx(styles.filterChip, filtersOpen && styles.chipOpen)}
                aria-expanded={filtersOpen}
                onClick={() => setFiltersOpen((current) => !current)}
              >
                Фильтры
              </Chip>
            )}
            <Chip selected={!query.category && !query.favorites} onClick={() => updateQuery({ category: "", favorites: false })}>
              Все
            </Chip>
            {(favoriteCount > 0 || query.favorites) && (
              <Chip
                icon={FavouriteIcon}
                count={favoriteCount}
                selected={query.favorites}
                className={styles.favoritesChip}
                onClick={() => updateQuery({ favorites: !query.favorites, category: "" })}
              >
                Избранное
              </Chip>
            )}
            {categories.map((category) => (
              <Chip
                key={category}
                selected={query.category === category}
                onClick={() => updateQuery({ category: query.category === category ? "" : category, favorites: false })}
              >
                {category}
              </Chip>
            ))}
          </ChipGroup>
          {filtersOpen && (
            <div className={styles.filtersPanel}>
              {sizes.length > 0 && (
                <div className={styles.filterGroup}>
                  <SectionLabel>Размер</SectionLabel>
                  <ChipGroup label="Размер">
                    {sizes.map((size) => (
                      <Chip key={size} selected={draft.size === size} onClick={() => setDraft((current) => ({ ...current, size: current.size === size ? "" : size }))}>
                        {size}
                      </Chip>
                    ))}
                  </ChipGroup>
                </div>
              )}
              {colors.length > 0 && (
                <div className={styles.filterGroup}>
                  <SectionLabel>Цвет</SectionLabel>
                  <ChipGroup label="Цвет">
                    {colors.map((color) => (
                      <ColorSwatch
                        key={color.name}
                        color={color.hex}
                        label={color.name}
                        size="lg"
                        selected={draft.color === color.name}
                        onClick={() => setDraft((current) => ({ ...current, color: current.color === color.name ? "" : color.name }))}
                      />
                    ))}
                  </ChipGroup>
                </div>
              )}
              <div className={styles.filtersActions}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDraft({ size: "", color: "" });
                    updateQuery({ size: "", color: "" });
                  }}
                >
                  Сбросить
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    updateQuery(draft);
                    setFiltersOpen(false);
                  }}
                >
                  Показать
                </Button>
              </div>
            </div>
          )}
        </Card>

        <div className={styles.toolbar}>
          <span className={styles.count} aria-live="polite">
            {listing.status === "loading" ? (
              <Spinner size="sm" />
            ) : (
              `${listing.total} ${plural(listing.total, ["товар", "товара", "товаров"])}`
            )}
          </span>
          <Select
            ariaLabel="Сортировка"
            className={styles.sortSelect}
            menuAlign="end"
            value={query.sort}
            onChange={(value) => updateQuery({ sort: value as Sort })}
            options={[
              { value: "new", label: "Сначала новые" },
              { value: "price-asc", label: "Сначала дешевле" },
              { value: "price-desc", label: "Сначала дороже" }
            ]}
          />
        </div>

        <CatalogBody
          listing={listing}
          storeSlug={storeSlug}
          isFavoritesView={query.favorites}
          isFiltered={isFiltered}
          isFavorite={favorites.has}
          onToggleFavorite={favorites.toggle}
          onRetry={() => void load(listing.products.length)}
          onLoadMore={() => void load(listing.products.length)}
          onReset={resetAll}
        />
      </section>

      <MobileContactBar store={store} storeSlug={storeSlug} />
    </Page>
  );
}

interface CatalogBodyProps {
  listing: Listing;
  storeSlug: string;
  isFavoritesView: boolean;
  isFiltered: boolean;
  isFavorite: (productId: string) => boolean;
  onToggleFavorite: (productId: string) => void;
  onRetry: () => void;
  onLoadMore: () => void;
  onReset: () => void;
}

function CatalogBody({ listing, storeSlug, isFavoritesView, isFiltered, isFavorite, onToggleFavorite, onRetry, onLoadMore, onReset }: CatalogBodyProps) {
  const { products, total, status } = listing;

  if (status === "loading" && !products.length) return <LoadingState label="Загружаем товары…" />;
  if (status === "error" && !products.length) {
    return <ErrorState title="Не удалось загрузить товары" description="Проверьте интернет и попробуйте ещё раз." onRetry={onRetry} />;
  }
  if (!products.length) {
    if (isFavoritesView) {
      return (
        <EmptyState
          icon={FavouriteIcon}
          title="В избранном пока пусто"
          description="Нажмите на сердечко на карточке товара — он появится здесь. Избранное хранится на этом телефоне."
          action={
            <Button variant="primary" onClick={onReset}>
              Смотреть все товары
            </Button>
          }
        />
      );
    }
    if (isFiltered) {
      return (
        <EmptyState
          title="Ничего не нашлось"
          description="Попробуйте другое слово или уберите фильтры."
          action={
            <Button variant="primary" onClick={onReset}>
              Сбросить поиск и фильтры
            </Button>
          }
        />
      );
    }
    return <EmptyState title="Скоро здесь появятся товары" description="Магазин наполняет витрину. Загляните позже или напишите продавцу." />;
  }

  return (
    <>
      <div className={cx(styles.grid, status === "loading" && styles.gridUpdating)}>
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            slug={storeSlug}
            favorite={isFavorite(product.id)}
            onToggleFavorite={() => onToggleFavorite(product.id)}
          />
        ))}
      </div>
      {products.length < total && (
        <div className={styles.more}>
          <Button variant="outline" size="lg" block loading={status === "loading-more"} onClick={onLoadMore}>
            Показать ещё
          </Button>
          <small className={styles.moreHint}>
            Показано {products.length} из {total}
          </small>
        </div>
      )}
      {status === "error" && products.length > 0 && (
        <ErrorState title="Не удалось загрузить продолжение" description="Проверьте интернет и попробуйте ещё раз." onRetry={onRetry} />
      )}
    </>
  );
}
