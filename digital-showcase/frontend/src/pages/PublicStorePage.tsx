import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon } from "@hugeicons/core-free-icons";
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

  useEffect(() => {
    api.get(`/public/stores/${storeSlug}`).then((res) => setStore(res.data)).catch((err) => setError(err.response?.data?.message ?? "Магазин недоступен"));
  }, [storeSlug]);

  useEffect(() => {
    api.get(`/public/stores/${storeSlug}/products`, { params: filters }).then((res) => setProducts(res.data));
  }, [storeSlug, filters]);

  const options = useMemo(
    () => ({
      categories: [...new Set(products.map((p) => p.category).filter(Boolean))],
      sizes: [...new Set(products.flatMap((p) => p.sizes.map((s) => s.value)))],
      colors: [...new Set(products.flatMap((p) => p.colors.map((c) => c.name)))]
    }),
    [products]
  );
  const visibleProducts = useMemo(() => {
    if (sort === "price-asc") return [...products].sort((a, b) => (a.price ?? Number.MAX_SAFE_INTEGER) - (b.price ?? Number.MAX_SAFE_INTEGER));
    if (sort === "price-desc") return [...products].sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
    return products;
  }, [products, sort]);

  function resetFilters() {
    const emptyFilters = { q: "", category: "", size: "", color: "" };
    setDraftFilters(emptyFilters);
    setFilters(emptyFilters);
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
      <aside className="storefront-filters">
        <div className="storefront-filters-head">
          <strong>Фильтры</strong>
          <button type="button" className="btn btn-ghost btn-sm" onClick={resetFilters}>Сбросить все</button>
        </div>
        <label className="search-field">
          <span>Поиск</span>
          <span className="search-field-input">
            <HugeiconsIcon icon={Search01Icon} size={16} strokeWidth={1.8} />
            <input placeholder="Поиск по названию" value={draftFilters.q} onChange={(e) => setDraftFilters({ ...draftFilters, q: e.target.value })} />
          </span>
        </label>
        <label>
          Категория
          <Select
            ariaLabel="Категория"
            value={draftFilters.category}
            onChange={(value) => setDraftFilters({ ...draftFilters, category: value })}
            options={[{ value: "", label: "Все категории" }, ...options.categories.map((v) => ({ value: v ?? "", label: v ?? "" }))]}
          />
        </label>
        <label>
          Размер
          <Select
            ariaLabel="Размер"
            value={draftFilters.size}
            onChange={(value) => setDraftFilters({ ...draftFilters, size: value })}
            options={[{ value: "", label: "Все размеры" }, ...options.sizes.map((v) => ({ value: v, label: v }))]}
          />
        </label>
        <label>
          Цвет
          <Select
            ariaLabel="Цвет"
            value={draftFilters.color}
            onChange={(value) => setDraftFilters({ ...draftFilters, color: value })}
            options={[{ value: "", label: "Все цвета" }, ...options.colors.map((v) => ({ value: v, label: v }))]}
          />
        </label>
        <button type="button" className="btn btn-primary" onClick={() => setFilters(draftFilters)}>Применить</button>
      </aside>
      <div className="storefront-main">
        <div className="storefront-head">
          <div>
            <h1>{store.name}</h1>
            {store.description && <p>{store.description}</p>}
          </div>
          <label className="storefront-sort">
            <span>Сортировка</span>
            <Select
              ariaLabel="Сортировка"
              value={sort}
              onChange={setSort}
              options={[
                { value: "new", label: "Сортировка: Новые" },
                { value: "price-asc", label: "Цена: сначала ниже" },
                { value: "price-desc", label: "Цена: сначала выше" }
              ]}
            />
          </label>
        </div>
        <div className="product-grid">
          {visibleProducts.map((product) => <ProductCard key={product.id} product={product} slug={storeSlug} />)}
        </div>
        {!visibleProducts.length && (
          <EmptyState
            title="Нет товаров"
            description="В этом магазине пока нет опубликованных товаров или они скрыты текущими фильтрами."
          />
        )}
      </div>
    </section>
  );
}

