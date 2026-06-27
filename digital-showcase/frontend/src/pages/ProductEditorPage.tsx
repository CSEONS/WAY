import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { ProductForm, type ProductPayload } from "../components/ProductForm";
import type { Product } from "../types/models";

export function ProductEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product>();

  useEffect(() => {
    if (id) api.get(`/owner/products/${id}`).then((res) => setProduct(res.data));
  }, [id]);

  async function save(payload: ProductPayload, file?: File) {
    const { data } = id ? await api.patch(`/owner/products/${id}`, payload) : await api.post("/owner/products", payload);
    if (file) {
      const formData = new FormData();
      formData.append("image", file);
      await api.post(`/owner/products/${data.id}/images`, formData);
    }
    navigate("/dashboard");
  }

  if (id && !product) return <section className="empty">Загрузка...</section>;
  return (
    <section className="narrow">
      <h1>{id ? "Редактировать товар" : "Новый товар"}</h1>
      <ProductForm initial={product} onSubmit={save} />
    </section>
  );
}
