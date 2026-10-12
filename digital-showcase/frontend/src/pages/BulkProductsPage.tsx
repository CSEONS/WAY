import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client";
import { BulkProductCreator } from "../components/bulk";
import type { Store } from "../types/models";
import { ButtonLink, EmptyState, ErrorState, LoadingState, Page } from "../ui";

/** «Добавить много товаров»: photos → sorting by the AI → prices. */
export function BulkProductsPage() {
  const { storeId } = useParams();
  const [store, setStore] = useState<Store>();
  const [hasLoadError, setHasLoadError] = useState(false);

  const load = useCallback(() => {
    if (!storeId) return;

    let ignore = false;
    setHasLoadError(false);
    api
      .get<Store>(`/owner/stores/${storeId}`)
      .then((res) => {
        if (!ignore) setStore(res.data);
      })
      .catch(() => {
        if (!ignore) setHasLoadError(true);
      });

    return () => {
      ignore = true;
    };
  }, [storeId]);

  useEffect(() => load(), [load]);

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
        <ErrorState description="Не удалось открыть страницу. Проверьте интернет и попробуйте ещё раз." onRetry={load} />
      </Page>
    );
  }

  if (store?.id !== storeId) {
    return (
      <Page width="narrow">
        <LoadingState />
      </Page>
    );
  }

  if (!store.aiFormEnabled) {
    return (
      <Page width="narrow">
        <EmptyState
          title="Добавление по фото не подключено"
          description="Для этого магазина ИИ выключен. Товары можно добавлять по одному."
          action={
            <ButtonLink variant="primary" to={`/dashboard/stores/${storeId}/products/new`}>
              Добавить товар
            </ButtonLink>
          }
        />
      </Page>
    );
  }

  return (
    <Page width="narrow">
      <BulkProductCreator storeId={storeId} />
    </Page>
  );
}
