import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client";
import type { Product, Store } from "../types/models";

export function PublicProductPage() {
  const { storeSlug = "", productId = "" } = useParams();
  const [data, setData] = useState<{ store: Store; product: Product }>();
  const [error, setError] = useState("");

  useEffect(() => {
    api.get(`/public/stores/${storeSlug}/products/${productId}`).then((res) => setData(res.data)).catch((err) => setError(err.response?.data?.message ?? "Товар недоступен"));
  }, [storeSlug, productId]);

  const contactHref = useMemo(() => {
    const store = data?.store;
    if (!store) return "#";
    if (store.whatsapp) return `https://wa.me/${store.whatsapp.replace(/\D/g, "")}`;
    if (store.telegram) return store.telegram.startsWith("http") ? store.telegram : `https://t.me/${store.telegram.replace("@", "")}`;
    return store.phone ? `tel:${store.phone}` : "#";
  }, [data]);

  if (error) return <section className="empty">{error}</section>;
  if (!data) return <section className="empty">Загрузка...</section>;
  const { store, product } = data;

  return (
    <section className="product-page">
      <div className="gallery">
        {product.images.length ? product.images.map((image) => <img key={image.id} src={image.url} alt={product.title} />) : <div className="placeholder">Фото скоро</div>}
      </div>
      <article>
        <h1>{product.title}</h1>
        <p className="price">{product.priceText || (product.price ? `${product.price.toLocaleString("ru-RU")} ₽` : "Цена в магазине")}</p>
        <p>{product.description}</p>
        <div className="chips">{product.sizes.map((s) => <span key={s.id}>{s.value}</span>)}{product.colors.map((c) => <span key={c.id}>{c.name}</span>)}</div>
        <p>Статус: {product.status === "AVAILABLE" ? "в наличии" : product.status === "NOT_AVAILABLE" ? "нет в наличии" : "уточнить в магазине"}</p>
        <div className="contact-box">
          <h2>{store.name}</h2>
          <p>{[store.address, store.phone, store.whatsapp, store.telegram].filter(Boolean).join(" · ")}</p>
          <a className="primary button-link" href={contactHref}>Связаться с магазином</a>
        </div>
      </article>
    </section>
  );
}
