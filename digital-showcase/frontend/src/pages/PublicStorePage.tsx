import { HugeiconsIcon } from "@hugeicons/react";
import { PaintBoardIcon, PreferenceHorizontalIcon, RulerIcon, Search01Icon, Tag01Icon } from "@hugeicons/core-free-icons";
import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client";
import { EmptyState } from "../components/EmptyState";
import { ProductCard } from "../components/ProductCard";
import { Select } from "../components/Select";
import type { Product, Store } from "../types/models";

export function PublicStorePage() {
  const { storeSlug = "" } = useParams();
  const [store, setStore] = useState<Store>();
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ q: "", category: "", size: "", color: "" });
  const [draftFilters, setDraftFilters] = useState({ q: "", category: "", size: "", color: "" });
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
    const emptyFilters = { q: "", category: "", size: "", color: "" };
    setDraftFilters(emptyFilters);
    setFilters(emptyFilters);
  }

  function openFilters() {
    setFiltersOpen(true);
  }

  if (error) {
    return (
      <section className="page page-storefront">
        <EmptyState
          title={error.includes("временно") || error.includes("подпис") ? "Магазин недоступен" : "Магазин не найден"}
          description={error.includes("временно") || error.includes("подпис") ? "Подписка могла истечь или магазин был архивирован." : error}
        />
      </section>
    );
  }
  if (!store) return <section className="page page-storefront">Загрузка...</section>;

  return (
    <section className="page page-storefront">
      <div className="storefront-filters">
        <div className="search-row">
          <label className="search">
            <HugeiconsIcon icon={Search01Icon} size={18} strokeWidth={1.8} />
            <input
              placeholder="Поиск по названию"
              value={draftFilters.q}
              onChange={(e) => {
                const next = { ...draftFilters, q: e.target.value };
                setDraftFilters(next);
                setFilters(next);
              }}
            />
          </label>
          <button
            type="button"
            className="filter-button"
            onClick={() => setFiltersOpen((current) => !current)}
            aria-expanded={filtersOpen}
          >
            <HugeiconsIcon icon={PreferenceHorizontalIcon} size={18} strokeWidth={1.8} />
            <span className="filter-button-label">Фильтры</span>
            <span className="filter-count">{activeFilterCount}</span>
          </button>
        </div>
        <div className="chips">
          <button type="button" className={`chip${activeFilterCount ? "" : " active"}`} onClick={resetFilters}>
            Все
          </button>
          <button type="button" className={`chip${filters.category ? " active" : ""}`} onClick={openFilters}>
            <HugeiconsIcon icon={Tag01Icon} size={15} strokeWidth={1.8} />
            Категория
            <ChevronDown size={14} strokeWidth={2} className="chip-chevron" />
          </button>
          <button type="button" className={`chip${filters.size ? " active" : ""}`} onClick={openFilters}>
            <HugeiconsIcon icon={RulerIcon} size={15} strokeWidth={1.8} />
            Размер
            <ChevronDown size={14} strokeWidth={2} className="chip-chevron" />
          </button>
          <button type="button" className={`chip${filters.color ? " active" : ""}`} onClick={openFilters}>
            <HugeiconsIcon icon={PaintBoardIcon} size={15} strokeWidth={1.8} />
            Цвет
            <ChevronDown size={14} strokeWidth={2} className="chip-chevron" />
          </button>
        </div>
        {filtersOpen && (
          <div className="filters-panel">
            <label>
              Категория
              <Select
                ariaLabel="Категория"
                value={draftFilters.category}
                onChange={(value) => setDraftFilters({ ...draftFilters, category: value })}
                options={[{ value: "", label: "Все категории" }, ...options.categories.map((v) => ({ value: v ?? "", label: v ?? "" }))]}
              />
            </label>
            {Boolean(options.sizes.length) && (
              <div className="variant-builder-block">
                <span className="variant-builder-label">Размер</span>
                <div className="variant-chip-row">
                  {options.sizes.map((size) => (
                    <button
                      key={size}
                      type="button"
                      className={`variant-size-chip${draftFilters.size === size ? " is-selected" : ""}`}
                      onClick={() => setDraftFilters((current) => ({ ...current, size: current.size === size ? "" : size }))}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {Boolean(options.colors.length) && (
              <div className="variant-builder-block">
                <span className="variant-builder-label">Цвет</span>
                <div className="variant-chip-row">
                  {options.colors.map((color) => (
                    <button
                      key={color.name}
                      type="button"
                      className={`variant-color-chip${draftFilters.color === color.name ? " is-selected" : ""}`}
                      onClick={() => setDraftFilters((current) => ({ ...current, color: current.color === color.name ? "" : color.name }))}
                      title={color.name}
                    >
                      <span className="variant-color-chip-swatch" style={{ background: color.hex ?? "#d8e5e8" }} />
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="filters-panel-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={resetFilters}>Сбросить все</button>
              <button type="button" className="btn btn-primary" onClick={() => setFilters(draftFilters)}>Применить</button>
            </div>
          </div>
        )}
      </div>
      <div className="storefront-head">
        <div>
          <h1>{store.name}</h1>
          {store.description && <p>{store.description}</p>}
        </div>
        <div className="storefront-sort">
          <span className="storefront-sort-label">
            <HugeiconsIcon icon={PreferenceHorizontalIcon} size={15} strokeWidth={1.8} />
            Сортировка
          </span>
          <Select
            ariaLabel="Сортировка"
            value={sort}
            onChange={setSort}
            options={[
              { value: "new", label: "Новые" },
              { value: "price-asc", label: "Сначала дешевле" },
              { value: "price-desc", label: "Сначала дороже" }
            ]}
          />
        </div>
      </div>
      <div className="product-grid">
        {visibleProducts.map((product) => <ProductCard key={product.id} product={product} slug={storeSlug} />)}
      </div>
      {!visibleProducts.length && (
        <EmptyState
          title="Товаров не найдено"
          description="Попробуйте изменить запрос или убрать фильтры. Здесь появятся товары, которые магазин опубликует."
          action={
            hasQueryOrFilters ? (
              <button type="button" className="btn btn-primary" onClick={resetFilters}>Сбросить поиск и фильтры</button>
            ) : undefined
          }
        />
      )}
    </section>
  );
}

