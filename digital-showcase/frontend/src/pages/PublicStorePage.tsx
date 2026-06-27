import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client";
import { ProductCard } from "../components/ProductCard";
import type { Product, Store } from "../types/models";

export function PublicStorePage() {
  const { storeSlug = "" } = useParams();
  const [store, setStore] = useState<Store>();
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ q: "", category: "", size: "", color: "" });

  useEffect(() => {
    api.get(`/public/stores/${storeSlug}`).then((res) => setStore(res.data)).catch((err) => setError(err.response?.data?.message ?? "Магазин недоступен"));
  }, [storeSlug]);

  useEffect(() => {
    api.get(`/public/stores/${storeSlug}/products`, { params: filters }).then((res) => setProducts(res.data));
  }, [storeSlug, filters]);

  const options = useMemo(() => ({
    categories: [...new Set(products.map((p) => p.category).filter(Boolean))],
    sizes: [...new Set(products.flatMap((p) => p.sizes.map((s) => s.value)))],
    colors: [...new Set(products.flatMap((p) => p.colors.map((c) => c.name)))]
  }), [products]);

  if (error) return <section className="empty">{error}</section>;
  if (!store) return <section className="empty">Загрузка...</section>;

  return (
    <section>
      <div className="store-head">
        {store.coverUrl && <img className="cover" src={store.coverUrl} alt="" />}
        <div className="store-title">
          {store.logoUrl && <img className="logo" src={store.logoUrl} alt="" />}
          <div>
            <h1>{store.name}</h1>
            <p>{store.description}</p>
            <p>{[store.address, store.phone, store.whatsapp, store.telegram].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
      </div>
      <div className="filters">
        <input placeholder="Поиск по названию" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        <select value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}><option value="">Категория</option>{options.categories.map((v) => <option key={v!}>{v}</option>)}</select>
        <select value={filters.size} onChange={(e) => setFilters({ ...filters, size: e.target.value })}><option value="">Размер</option>{options.sizes.map((v) => <option key={v}>{v}</option>)}</select>
        <select value={filters.color} onChange={(e) => setFilters({ ...filters, color: e.target.value })}><option value="">Цвет</option>{options.colors.map((v) => <option key={v}>{v}</option>)}</select>
      </div>
      <div className="product-grid">
        {products.map((product) => <ProductCard key={product.id} product={product} slug={storeSlug} />)}
      </div>
    </section>
  );
}
