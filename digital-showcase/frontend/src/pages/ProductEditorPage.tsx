import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { ProductForm, type ProductImageSelection, type ProductPayload } from "../components/ProductForm";
import type { Product, Store } from "../types/models";

export function ProductEditorPage() {
  const { storeId, id } = useParams();
  const navigate = useNavigate();
  const [store, setStore] = useState<Store>();
  const [product, setProduct] = useState<Product>();
  const [isLoading, setIsLoading] = useState(Boolean(storeId));

  useEffect(() => {
    if (!storeId) return;

    let ignore = false;
    setIsLoading(true);
    const requests: Promise<unknown>[] = [
      api.get<Store>(`/owner/stores/${storeId}`).then((res) => {
        if (!ignore) setStore(res.data);
      })
    ];

    if (id) {
      requests.push(
        api.get<Product>(`/owner/stores/${storeId}/products/${id}`).then((res) => {
          if (!ignore) setProduct(res.data);
        })
      );
    }

    Promise.all(requests).finally(() => {
      if (!ignore) setIsLoading(false);
    });

    return () => {
      ignore = true;
    };
  }, [storeId, id]);

  async function save(payload: ProductPayload, imageSelection: ProductImageSelection) {
    if (!storeId) return;
    const basePath = `/owner/stores/${storeId}/products`;
    const { data } = id ? await api.patch<Product>(`${basePath}/${id}`, payload) : await api.post<Product>(basePath, payload);
    const orderedImages = [...imageSelection.images].sort((left, right) => {
      if (left.id === imageSelection.previewImageId) return -1;
      if (right.id === imageSelection.previewImageId) return 1;
      return 0;
    });
    const keptExistingIds = new Set(imageSelection.images.map((image) => image.existingId).filter(Boolean));
    const initialImageIds = product?.images.map((image) => image.id) ?? [];

    for (const imageId of initialImageIds) {
      if (!keptExistingIds.has(imageId)) await api.delete(`${basePath}/${data.id}/images/${imageId}`);
    }

    const uploadedIds = new Map<string, string>();
    const knownImageIds = new Set([...initialImageIds].filter((imageId) => keptExistingIds.has(imageId)));

    for (const image of orderedImages) {
      if (!image.file) continue;
      const formData = new FormData();
      formData.append("image", image.file);
      const response = await api.post<Product>(`${basePath}/${data.id}/images`, formData);
      const uploaded = response.data.images.find((item) => !knownImageIds.has(item.id));
      if (uploaded) {
        uploadedIds.set(image.id, uploaded.id);
        knownImageIds.add(uploaded.id);
      }
    }

    const imageIds = orderedImages
      .map((image) => image.existingId ?? uploadedIds.get(image.id))
      .filter((imageId): imageId is string => Boolean(imageId));
    if (imageIds.length) await api.patch(`${basePath}/${data.id}/images/order`, { imageIds });

    navigate(`/dashboard/stores/${storeId}`);
  }

  if (!storeId) {
    return (
      <section className="empty">
        <div>
          <p>Сначала выберите магазин.</p>
          <Link className="button-link" to="/dashboard">
            К выбору магазина
          </Link>
        </div>
      </section>
    );
  }

  if (isLoading || (id && !product)) return <section className="empty">Загрузка...</section>;

  return (
    <section className="narrow">
      <p className="eyebrow">{store?.name}</p>
      <h1>{id ? "Редактировать товар" : "Новый товар"}</h1>
      <ProductForm
        initial={product}
        aiDraftPath={`/owner/stores/${storeId}/products/ai-draft`}
        aiFormEnabled={Boolean(store?.aiFormEnabled)}
        onSubmit={save}
      />
    </section>
  );
}
