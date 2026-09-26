import { ArrowDown01Icon, PreferenceHorizontalIcon, Search01Icon } from "@hugeicons/core-free-icons";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client";
import { ProductCard } from "../components/ProductCard";
import type { Product, Store } from "../types/models";
import {
  Button,
  Card,
  Chip,
  ChipGroup,
  ColorSwatch,
  EmptyState,
  Field,
  Icon,
  Input,
  LoadingState,
  Page,
  PageHeader,
  SectionLabel,
  Select,
  cx
} from "../ui";
import styles from "./PublicStorePage.module.css";

const emptyFilters = { q: "", category: "", size: "", color: "" };

export function PublicStorePage() {
  const { storeSlug = "" } = useParams();
  const [store, setStore] = useState<Store>();
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState(emptyFilters);
  const [draftFilters, setDraftFilters] = useState(emptyFilters);
  const [sort, setSort] = useState("new");
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    api.get(`/public/stores/${storeSlug}`).then((res) => setStore(res.data)).catch((err) => setError(err.response?.data?.message ?? "Магазин недоступен"));
  }, [storeSlug]);

  useEffect(() => {
    api.get(`/public/stores/${storeSlug}/products`, { params: filters }).then((res) => setProducts(res.data));
  }, [storeSlug, filters]);

  const options = useMemo(() => {
    const colorMap = new Map<string, string | null>();
    for (const product of products) {
      for (const color of product.colors) {
        if (!colorMap.has(color.name)) colorMap.set(color.name, color.hex);
      }
    }

    return {
      categories: [...new Set(products.map((p) => p.category).filter(Boolean))],
      sizes: [...new Set(products.flatMap((p) => p.sizes.map((s) => s.value)))],
      colors: [...colorMap.entries()].map(([name, hex]) => ({ name, hex }))
    };
  }, [products]);
  const visibleProducts = useMemo(() => {
    if (sort === "price-asc") return [...products].sort((a, b) => (a.price ?? Number.MAX_SAFE_INTEGER) - (b.price ?? Number.MAX_SAFE_INTEGER));
    if (sort === "price-desc") return [...products].sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
    return products;
  }, [products, sort]);

  const activeFilterCount = [filters.category, filters.size, filters.color].filter(Boolean).length;
  const hasQueryOrFilters = Boolean(filters.q || activeFilterCount);

  function resetFilters() {
    setDraftFilters(emptyFilters);
    setFilters(emptyFilters);
  }

  if (error) {
    const isUnavailable = error.includes("временно") || error.includes("подпис");
    return (
      <Page>
        <EmptyState
          title={isUnavailable ? "Магазин недоступен" : "Магазин не найден"}
          description={isUnavailable ? "Подписка могла истечь или магазин был архивирован." : error}
        />
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

  return (
    <Page className={styles.page}>
      <Card padding="sm" className={styles.filters}>
        <Input
          icon={Search01Icon}
          aria-label="Поиск по названию"
          placeholder="Поиск по названию"
          value={draftFilters.q}
          onChange={(e) => {
            const next = { ...draftFilters, q: e.target.value };
            setDraftFilters(next);
            setFilters(next);
          }}
        />
        <ChipGroup scroll>
          <Chip
            icon={PreferenceHorizontalIcon}
            iconEnd={ArrowDown01Icon}
            count={activeFilterCount}
            selected={activeFilterCount > 0}
            className={cx(styles.filterChip, filtersOpen && styles.chipOpen)}
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((current) => !current)}
          >
            Фильтры
          </Chip>
        </ChipGroup>
        {filtersOpen && (
          <div className={styles.filtersPanel}>
            <Field label="Категория">
              <Select
                value={draftFilters.category}
                onChange={(value) => setDraftFilters({ ...draftFilters, category: value })}
                options={[{ value: "", label: "Все категории" }, ...options.categories.map((v) => ({ value: v ?? "", label: v ?? "" }))]}
              />
            </Field>
            {Boolean(options.sizes.length) && (
              <div className={styles.filterGroup}>
                <SectionLabel>Размер</SectionLabel>
                <ChipGroup label="Размер">
                  {options.sizes.map((size) => (
                    <Chip
                      key={size}
                      selected={draftFilters.size === size}
                      onClick={() => setDraftFilters((current) => ({ ...current, size: current.size === size ? "" : size }))}
                    >
                      {size}
                    </Chip>
                  ))}
                </ChipGroup>
              </div>
            )}
            {Boolean(options.colors.length) && (
              <div className={styles.filterGroup}>
                <SectionLabel>Цвет</SectionLabel>
                <ChipGroup label="Цвет">
                  {options.colors.map((color) => (
                    <ColorSwatch
                      key={color.name}
                      color={color.hex}
                      label={color.name}
                      size="lg"
                      selected={draftFilters.color === color.name}
                      onClick={() => setDraftFilters((current) => ({ ...current, color: current.color === color.name ? "" : color.name }))}
                    />
                  ))}
                </ChipGroup>
              </div>
            )}
            <div className={styles.filtersActions}>
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                Сбросить все
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setFilters(draftFilters);
                  setFiltersOpen(false);
                }}
              >
                Применить
              </Button>
            </div>
          </div>
        )}
      </Card>
      <PageHeader
        title={store.name}
        description={store.description}
        actions={
          <div className={styles.sort}>
            <span className={styles.sortLabel}>
              <Icon icon={PreferenceHorizontalIcon} size="sm" />
              Сортировка
            </span>
            <Select
              ariaLabel="Сортировка"
              className={styles.sortSelect}
              menuAlign="end"
              value={sort}
              onChange={setSort}
              options={[
                { value: "new", label: "Новые" },
                { value: "price-asc", label: "Сначала дешевле" },
                { value: "price-desc", label: "Сначала дороже" }
              ]}
            />
          </div>
        }
      />
      {visibleProducts.length ? (
        <div className={styles.grid}>
          {visibleProducts.map((product) => (
            <ProductCard key={product.id} product={product} slug={storeSlug} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="Товаров не найдено"
          description="Попробуйте изменить запрос или убрать фильтры. Здесь появятся товары, которые магазин опубликует."
          action={
            hasQueryOrFilters ? (
              <Button variant="primary" onClick={resetFilters}>
                Сбросить поиск и фильтры
              </Button>
            ) : undefined
          }
        />
      )}
    </Page>
  );
}
