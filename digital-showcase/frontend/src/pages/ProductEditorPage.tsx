import { ArrowLeft } from "lucide-react";
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

  async function save(payload: ProductPayload, imageSelection: ProductImageSelection, onProgress: (status: string) => void) {
    if (!storeId) return;
    const basePath = `/owner/stores/${storeId}/products`;
    onProgress("Сохраняем товар…");
    const { data } = id ? await api.patch<Product>(`${basePath}/${id}`, payload) : await api.post<Product>(basePath, payload);
    const orderedImages = [...imageSelection.images].sort((left, right) => {
      if (left.id === imageSelection.previewImageId) return -1;
      if (right.id === imageSelection.previewImageId) return 1;
      return 0;
    });
    const keptExistingIds = new Set(imageSelection.images.map((image) => image.existingId).filter(Boolean));
    const initialImageIds = product?.images.map((image) => image.id) ?? [];
    const imagesToDelete = initialImageIds.filter((imageId) => !keptExistingIds.has(imageId));

    for (const [index, imageId] of imagesToDelete.entries()) {
      if (imagesToDelete.length > 1) onProgress(`Удаляем старые фото… (${index + 1}/${imagesToDelete.length})`);
      await api.delete(`${basePath}/${data.id}/images/${imageId}`);
    }

    const uploadedIds = new Map<string, string>();
    const knownImageIds = new Set([...initialImageIds].filter((imageId) => keptExistingIds.has(imageId)));
    const imagesToUpload = orderedImages.filter((image) => image.file);

    for (const [index, image] of imagesToUpload.entries()) {
      onProgress(
        imagesToUpload.length > 1 ? `Загружаем фото ${index + 1} из ${imagesToUpload.length}…` : "Загружаем фото…"
      );
      const formData = new FormData();
      formData.append("image", image.file as File);
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
    if (imageIds.length) {
      onProgress("Сохраняем порядок фото…");
      await api.patch(`${basePath}/${data.id}/images/order`, { imageIds });
    }

    navigate(`/dashboard/stores/${storeId}`);
  }

  if (!storeId) {
    return (
      <section className="page page-narrow page-product-editor page-legacy">
        <div>
          <p>Сначала выберите магазин.</p>
          <Link to="/dashboard">
            К выбору магазина
          </Link>
        </div>
      </section>
    );
  }

  if (isLoading || (id && !product)) return <section className="page page-narrow page-product-editor page-legacy">Загрузка...</section>;

  return (
    <section className="page page-narrow page-product-editor page-legacy">
      <Link className="back-link" to={`/dashboard/stores/${storeId}`}>
        <ArrowLeft size={16} strokeWidth={2} />
        Вернуться назад
      </Link>
      <h1>{id ? "Редактировать товар" : "Новый товар"}</h1>
      <ProductForm
        initial={product}
        aiDraftPath={`/owner/stores/${storeId}/products/ai-draft`}
        aiFormEnabled={Boolean(store?.aiFormEnabled)}
        draftKey={`product-form-draft:${storeId}:${id ?? "new"}`}
        onSubmit={save}
      />
    </section>
  );
}

