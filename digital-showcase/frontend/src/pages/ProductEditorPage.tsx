import { ViewIcon } from "@hugeicons/core-free-icons";
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
  const { jobs, queueProductSave } = useBackgroundJobs();
  const [store, setStore] = useState<Store>();
  const [product, setProduct] = useState<Product>();
  const [categories, setCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(storeId));
  const [hasLoadError, setHasLoadError] = useState(false);
  const [stage, setStage] = useState<"form" | "queued">("form");
  const [formKey, setFormKey] = useState(0);
  // The save running in the background, and the product it saved: kept here, the dock forgets a finished job.
  const [jobId, setJobId] = useState<string | null>(null);
  const [savedProductId, setSavedProductId] = useState<string | null>(null);
  const job = jobs.find((item) => item.id === jobId);

  // A product waiting only for its preview can be opened already: the preview joins it in a minute.
  useEffect(() => {
    if ((job?.status === "done" || job?.waitsForPreview) && job.productId) setSavedProductId(job.productId);
  }, [job?.status, job?.waitsForPreview, job?.productId]);

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

    // The store's own categories are a convenience: the form opens without them if they don't load.
    api
      .get<string[]>(`/owner/stores/${storeId}/categories`)
      .then((res) => {
        if (!ignore) setCategories(res.data);
      })
      .catch(() => undefined);

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
    const queued = queueProductSave({
      storeId,
      productId: id,
      payload,
      imageSelection,
      existingImageIds: product?.images.map((image) => image.id) ?? []
    });
    setJobId(queued);
    setSavedProductId(null);
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
    setJobId(null);
    setSavedProductId(null);
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
            {savedProductId && store ? (
              // Opens as the owner sees it: «Поделиться», «Редактировать», «Скрыть» — a draft hidden from the storefront too.
              <ButtonLink variant="secondary" icon={ViewIcon} to={`/m/${store.slug}/p/${savedProductId}`}>
                Посмотреть товар
              </ButtonLink>
            ) : (
              job?.status !== "error" && (
                <Button variant="secondary" icon={ViewIcon} loading disabled>
                  Сохраняется…
                </Button>
              )
            )}
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
          aiPreviewPath={store?.aiPreviewEnabled ? `/owner/stores/${storeId}/products/ai-preview` : undefined}
          aiFormEnabled={Boolean(store?.aiFormEnabled)}
          storeCategories={categories}
          draftKey={`product-form-draft:${storeId}:${id ?? "new"}`}
          onSubmit={handleSubmit}
        />
      )}
    </Page>
  );
}
