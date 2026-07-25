import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client";
import { EmptyState } from "../components/EmptyState";
import { ProductCard } from "../components/ProductCard";
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
      <section>
        <EmptyState
          title={error.includes("временно") || error.includes("подпис") ? "Магазин недоступен" : "Магазин не найден"}
          description={error.includes("временно") || error.includes("подпис") ? "Подписка могла истечь или магазин был архивирован." : error}
        />
      </section>
    );
  }
  if (!store) return <section>Загрузка...</section>;

  return (
    <section>
      <aside>
        <div>
          <strong>Фильтры</strong>
          <button type="button" onClick={resetFilters}>Сбросить все</button>
        </div>
        <label>
          <span>Поиск</span>
          <input placeholder="Поиск по названию" value={draftFilters.q} onChange={(e) => setDraftFilters({ ...draftFilters, q: e.target.value })} />
        </label>
        <label>
          Категория
          <select value={draftFilters.category} onChange={(e) => setDraftFilters({ ...draftFilters, category: e.target.value })}>
            <option value="">Все категории</option>
            {options.categories.map((v) => <option key={v!}>{v}</option>)}
          </select>
        </label>
        <label>
          Размер
          <select value={draftFilters.size} onChange={(e) => setDraftFilters({ ...draftFilters, size: e.target.value })}>
            <option value="">Все размеры</option>
            {options.sizes.map((v) => <option key={v}>{v}</option>)}
          </select>
        </label>
        <label>
          Цвет
          <select value={draftFilters.color} onChange={(e) => setDraftFilters({ ...draftFilters, color: e.target.value })}>
            <option value="">Все цвета</option>
            {options.colors.map((v) => <option key={v}>{v}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => setFilters(draftFilters)}>Применить</button>
      </aside>
      <div>
        <div>
          <div>
            <h1>{store.name}</h1>
            {store.description && <p>{store.description}</p>}
          </div>
          <label>
            <span>Сортировка</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="new">Сортировка: Новые</option>
              <option value="price-asc">Цена: сначала ниже</option>
              <option value="price-desc">Цена: сначала выше</option>
            </select>
          </label>
        </div>
        <div>
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
