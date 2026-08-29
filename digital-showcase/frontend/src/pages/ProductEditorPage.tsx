import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { ProductForm, type ProductImageSelection, type ProductPayload } from "../components/ProductForm";
import { useBackgroundJobs } from "../state/backgroundJobs";
import type { Product, Store } from "../types/models";

export function ProductEditorPage() {
  const { storeId, id } = useParams();
  const navigate = useNavigate();
  const { queueProductSave } = useBackgroundJobs();
  const [store, setStore] = useState<Store>();
  const [product, setProduct] = useState<Product>();
  const [isLoading, setIsLoading] = useState(Boolean(storeId));
  const [stage, setStage] = useState<"form" | "queued">("form");
  const [formKey, setFormKey] = useState(0);

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

  function handleSubmit(payload: ProductPayload, imageSelection: ProductImageSelection) {
    if (!storeId) return;
    queueProductSave({
      storeId,
      productId: id,
      payload,
      imageSelection,
      existingImageIds: product?.images.map((image) => image.id) ?? []
    });
    setStage("queued");
  }

  function createAnother() {
    if (id) {
      // Editing an existing product: hop to the "new product" route, which
      // remounts this page with a clean slate.
      navigate(`/dashboard/stores/${storeId}/products/new`);
      return;
    }
    // Already on the "new product" route — just reset locally, no navigation
    // needed (and none would remount the same route anyway).
    setStage("form");
    setFormKey((key) => key + 1);
  }

  function goToList() {
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
      {stage === "queued" ? (
        <>
          <div className="notice-banner notice-success" role="status">
            <HugeiconsIcon icon={CheckmarkCircle02Icon} size={18} strokeWidth={1.8} />
            <div>
              <strong>Товар сохраняется в фоне</strong>
              <span>Прогресс и результат можно посмотреть в любой момент — в правом нижнем углу экрана.</span>
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-primary" onClick={createAnother}>
              Создать ещё один товар
            </button>
            <button type="button" className="btn btn-secondary" onClick={goToList}>
              К списку товаров
            </button>
          </div>
        </>
      ) : (
        <ProductForm
          key={formKey}
          initial={product}
          aiDraftPath={`/owner/stores/${storeId}/products/ai-draft`}
          aiFormEnabled={Boolean(store?.aiFormEnabled)}
          draftKey={`product-form-draft:${storeId}:${id ?? "new"}`}
          onSubmit={handleSubmit}
        />
      )}
    </section>
  );
}
