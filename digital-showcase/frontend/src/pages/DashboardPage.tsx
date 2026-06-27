import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { Product, Store } from "../types/models";

export function DashboardPage() {
  const [store, setStore] = useState<Store>();
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    api.get("/owner/store").then((res) => setStore(res.data));
    api.get("/owner/products").then((res) => setProducts(res.data));
  }, []);

  return (
    <section>
      <div className="section-head">
        <div>
          <h1>Кабинет владельца</h1>
          {store && <p>Публичная ссылка: <a href={`/m/${store.slug}`}>{location.origin}/m/{store.slug}</a></p>}
        </div>
        <Link className="primary button-link" to="/dashboard/products/new">Добавить товар</Link>
      </div>
      <div className="tabs"><Link to="/dashboard/products">Товары</Link><Link to="/dashboard/settings">Настройки магазина</Link></div>
      <div className="table">
        {products.map((product) => (
          <div className="row" key={product.id}>
            <span>{product.title}</span>
            <span>{product.isVisible ? "Опубликован" : "Скрыт"}</span>
            <Link to={`/dashboard/products/${product.id}/edit`}>Редактировать</Link>
          </div>
        ))}
      </div>
    </section>
  );
}
