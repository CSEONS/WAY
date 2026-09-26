import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { ProductForm, type ProductImageSelection, type ProductPayload } from "../components/product-form";
import { useBackgroundJobs } from "../state/backgroundJobs";
import type { Product, Store } from "../types/models";
import { Button, ButtonLink, EmptyState, ErrorState, LoadingState, Notice, Page, PageHeader } from "../ui";
import styles from "./ProductEditorPage.module.css";

export function ProductEditorPage() {
  const { storeId, id } = useParams();
  const navigate = useNavigate();
  const { queueProductSave } = useBackgroundJobs();
  const [store, setStore] = useState<Store>();
  const [product, setProduct] = useState<Product>();
  const [isLoading, setIsLoading] = useState(Boolean(storeId));
  const [hasLoadError, setHasLoadError] = useState(false);
  const [stage, setStage] = useState<"form" | "queued">("form");
  const [formKey, setFormKey] = useState(0);

  const load = useCallback(() => {
    if (!storeId) return;

    let ignore = false;
    setIsLoading(true);
    setHasLoadError(false);
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

    Promise.all(requests)
      .catch(() => {
        if (!ignore) setHasLoadError(true);
      })
      .finally(() => {
        if (!ignore) setIsLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [storeId, id]);

  useEffect(() => load(), [load]);

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

  if (!storeId) {
    return (
      <Page width="narrow">
        <EmptyState
          title="Сначала выберите магазин"
          action={
            <ButtonLink variant="primary" to="/dashboard">
              К выбору магазина
            </ButtonLink>
          }
        />
      </Page>
    );
  }

  if (hasLoadError) {
    return (
      <Page width="narrow">
        <ErrorState description="Не удалось загрузить товар. Проверьте интернет и попробуйте ещё раз." onRetry={load} />
      </Page>
    );
  }

  if (isLoading || (id && !product)) {
    return (
      <Page width="narrow">
        <LoadingState />
      </Page>
    );
  }

  return (
    <Page width="narrow">
      <PageHeader title={id ? "Редактировать товар" : "Новый товар"} back={{ to: `/dashboard/stores/${storeId}`, label: "Вернуться назад" }} />
      {stage === "queued" ? (
        <>
          <Notice tone="success" title="Товар сохраняется в фоне">
            Прогресс и результат можно посмотреть в любой момент — в правом нижнем углу экрана.
          </Notice>
          <div className={styles.actions}>
            <Button variant="primary" onClick={createAnother}>
              Создать ещё один товар
            </Button>
            <ButtonLink variant="secondary" to={`/dashboard/stores/${storeId}`}>
              К списку товаров
            </ButtonLink>
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
    </Page>
  );
}
