import {
  Analytics01Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  Copy01Icon,
  Exchange01Icon,
  EyeIcon,
  Home01Icon,
  InformationCircleIcon,
  Link04Icon,
  Package01Icon,
  PackageRemoveIcon,
  PlusSignIcon,
  PrinterIcon,
  Search01Icon,
  Settings01Icon,
  ShoppingBag01Icon,
  Store01Icon,
  ViewIcon,
  ViewOffSlashIcon
} from "@hugeicons/core-free-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";
import { api } from "../api/client";
import { BulkProductCreator } from "../components/BulkProductCreator";
import { InstallHint } from "../components/dashboard/InstallHint";
import { LaunchChecklist } from "../components/dashboard/LaunchChecklist";
import { OwnerProductItem } from "../components/dashboard/OwnerProductItem";
import { PriceModal } from "../components/dashboard/PriceModal";
import { markStoreShared } from "../components/dashboard/shareState";
import { QrShareButton } from "../components/QrShareButton";
import type { Product, Store } from "../types/models";
import { plural } from "../utils/format";
import {
  Breadcrumbs,
  Button,
  ButtonLink,
  Card,
  ConfirmModal,
  EmptyState,
  ErrorState,
  Field,
  Icon,
  IconButtonLink,
  Input,
  LoadingState,
  Notice,
  Page,
  PageHeader,
  Select,
  Stat,
  StatusDot,
  cx,
  useCopyToClipboard
} from "../ui";
import styles from "./DashboardPage.module.css";

type StoreAnalytics = { productCount: number; storeViews: number; productViews: number };
type ListFilter = "all" | "visible" | "hidden" | "unavailable";

const emptyAnalytics: StoreAnalytics = { productCount: 0, storeViews: 0, productViews: 0 };

const filterMatchers: Record<ListFilter, (product: Product) => boolean> = {
  all: () => true,
  visible: (product) => Boolean(product.isVisible),
  hidden: (product) => !product.isVisible,
  unavailable: (product) => product.status === "NOT_AVAILABLE"
};

function formatStoreDate(value?: string | null) {
  if (!value) return "Дата создания не указана";
  return `Магазин создан ${new Date(value).toLocaleString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}`;
}

function sortValue(product: Product) {
  return product.price ?? Math.min(...product.variants.map((variant) => variant.price ?? Number.POSITIVE_INFINITY));
}

function StoreAvatar({ store }: { store: Store }) {
  return (
    <span className={styles.avatar}>
      {store.logoUrl ? <img src={store.logoUrl} alt="" /> : <Icon icon={Store01Icon} size="md" strokeWidth={1.6} />}
    </span>
  );
}

function PublicLink({ store, url }: { store: Store; url: string }) {
  const copy = useCopyToClipboard();
  return (
    <div className={styles.linkValue}>
      <a className={styles.link} href={`/m/${store.slug}`}>
        {url.replace(/^https?:\/\//, "")}
      </a>
      <div className={styles.linkActions}>
        <Button
          variant="neutral"
          size="sm"
          icon={Copy01Icon}
          onClick={async () => {
            if (await copy(url, "Ссылка скопирована")) markStoreShared(store.id);
          }}
        >
          Копировать
        </Button>
        <QrShareButton url={url} label="QR" onOpen={() => markStoreShared(store.id)} />
        <ButtonLink variant="outline" size="sm" icon={PrinterIcon} to={`/dashboard/stores/${store.id}/poster`}>
          Плакат
        </ButtonLink>
      </div>
    </div>
  );
}

function StoreChoiceCard({ store }: { store: Store }) {
  const publicUrl = `${location.origin}/m/${store.slug}`;

  return (
    <Card as="article" padding="lg" className={styles.storeCard}>
      <div className={styles.storeHead}>
        <StoreAvatar store={store} />
        <div className={styles.storeTitle}>
          <h2 className={styles.storeName}>{store.name}</h2>
          <StatusDot tone={store.isActive ? "success" : "neutral"}>{store.isActive ? "Активен" : "В архиве"}</StatusDot>
        </div>
      </div>
      <div className={styles.linkRow}>
        <span className={styles.linkLabel}>
          <Icon icon={Link04Icon} size="sm" />
          Ссылка на витрину
        </span>
        <PublicLink store={store} url={publicUrl} />
      </div>
      <div className={styles.storeActions}>
        <ButtonLink variant="primary" icon={ShoppingBag01Icon} iconEnd={ArrowRight01Icon} to={`/dashboard/stores/${store.id}`}>
          Открыть магазин
        </ButtonLink>
        <ButtonLink variant="secondary" icon={Settings01Icon} to={`/dashboard/stores/${store.id}/settings`}>
          Реквизиты
        </ButtonLink>
      </div>
      <p className={styles.meta}>
        <Icon icon={InformationCircleIcon} size="sm" />
        {formatStoreDate(store.createdAt)}
      </p>
    </Card>
  );
}

export function DashboardPage() {
  const { storeId } = useParams();
  const routerLocation = useLocation();
  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [analytics, setAnalytics] = useState<StoreAnalytics>(emptyAnalytics);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [productsState, setProductsState] = useState<"loading" | "ready" | "error">("loading");
  const [search, setSearch] = useState("");
  const [listFilter, setListFilter] = useState<ListFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sort, setSort] = useState("new");
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [productToReprice, setProductToReprice] = useState<Product | null>(null);
  const [bulkCreatorOpen, setBulkCreatorOpen] = useState(false);
  const selectedStore = stores.find((store) => store.id === storeId);
  const publicStoreUrl = selectedStore ? `${location.origin}/m/${selectedStore.slug}` : "";
  const isSubscriptionExpired = Boolean(selectedStore?.subscriptionEndsAt && new Date(selectedStore.subscriptionEndsAt).getTime() < Date.now());

  const categories = useMemo(
    () => [...new Set(products.map((product) => product.category).filter((category): category is string => Boolean(category)))],
    [products]
  );

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    const nextProducts = products.filter(
      (product) =>
        (!query || product.title.toLowerCase().includes(query)) &&
        filterMatchers[listFilter](product) &&
        (categoryFilter === "all" || product.category === categoryFilter)
    );

    const updatedAt = (product: Product) => new Date(product.updatedAt ?? product.createdAt).getTime();
    return nextProducts.sort((left, right) => {
      if (sort === "old") return updatedAt(left) - updatedAt(right);
      if (sort === "price-asc") return sortValue(left) - sortValue(right);
      if (sort === "price-desc") return sortValue(right) - sortValue(left);
      return updatedAt(right) - updatedAt(left);
    });
  }, [categoryFilter, products, search, sort, listFilter]);

  const stats = useMemo(
    () => ({
      visible: products.filter(filterMatchers.visible).length,
      hidden: products.filter(filterMatchers.hidden).length,
      unavailable: products.filter(filterMatchers.unavailable).length
    }),
    [products]
  );

  const loadStores = useCallback(() => {
    let ignore = false;
    setIsLoading(true);
    setLoadError(false);
    api
      .get<Store[]>("/owner/stores")
      .then((res) => {
        if (!ignore) setStores(res.data);
      })
      .catch(() => {
        if (!ignore) setLoadError(true);
      })
      .finally(() => {
        if (!ignore) setIsLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => loadStores(), [loadStores]);

  const loadProducts = useCallback(() => {
    if (!storeId) {
      setProducts([]);
      setAnalytics(emptyAnalytics);
      return;
    }

    let ignore = false;
    setProductsState("loading");
    Promise.all([api.get<Product[]>(`/owner/stores/${storeId}/products`), api.get<StoreAnalytics>(`/owner/stores/${storeId}/analytics`)])
      .then(([productsRes, analyticsRes]) => {
        if (ignore) return;
        setProducts(productsRes.data);
        setAnalytics(analyticsRes.data);
        setProductsState("ready");
      })
      .catch(() => {
        if (!ignore) setProductsState("error");
      });
    return () => {
      ignore = true;
    };
  }, [storeId]);

  useEffect(() => loadProducts(), [loadProducts]);

  function replaceProduct(updated: Product) {
    setProducts((current) => current.map((product) => (product.id === updated.id ? updated : product)));
  }

  async function deleteProduct() {
    if (!storeId || !productToDelete) return;
    await api.delete(`/owner/stores/${storeId}/products/${productToDelete.id}`);
    setProducts((current) => current.filter((product) => product.id !== productToDelete.id));
    setProductToDelete(null);
  }

  if (isLoading) {
    return (
      <Page>
        <LoadingState />
      </Page>
    );
  }

  if (loadError) {
    return (
      <Page>
        <ErrorState description="Не удалось загрузить магазины. Проверьте интернет и попробуйте ещё раз." onRetry={loadStores} />
      </Page>
    );
  }

  if (!storeId) {
    if (stores.length === 1 && !(routerLocation.state as { showAll?: boolean } | null)?.showAll) {
      return <Navigate to={`/dashboard/stores/${stores[0].id}`} replace />;
    }

    return (
      <Page>
        <PageHeader title="Кабинет владельца" description="Выберите магазин, чтобы добавлять товары и менять реквизиты." />
        {stores.length ? (
          <div className={styles.storeGrid}>
            {stores.map((store) => (
              <StoreChoiceCard store={store} key={store.id} />
            ))}
          </div>
        ) : (
          <EmptyState title="Магазин ещё не создан" description="Администратор должен создать магазин и привязать его к вашему аккаунту." />
        )}
      </Page>
    );
  }

  if (!selectedStore) {
    return (
      <Page>
        <EmptyState
          title="Магазин недоступен"
          description="Магазин не найден или больше не привязан к вашему аккаунту."
          action={
            <ButtonLink variant="primary" to="/dashboard" state={{ showAll: true }}>
              Вернуться к выбору магазина
            </ButtonLink>
          }
        />
      </Page>
    );
  }

  const productWord = plural(products.length, ["товара", "товаров", "товаров"]);
  const timesWord = plural(analytics.storeViews, ["раз", "раза", "раз"]);

  return (
    <Page className={styles.page}>
      {stores.length > 1 && (
        <Breadcrumbs
          items={[
            { label: "К выбору магазина", icon: Home01Icon, to: "/dashboard", state: { showAll: true } },
            { label: "Магазины", to: "/dashboard", state: { showAll: true } },
            { label: selectedStore.name }
          ]}
        />
      )}

      <Card padding="lg" className={styles.hero}>
        <div className={styles.heroTop}>
          <div className={styles.heroBody}>
            <h1 className={styles.heroTitle}>{selectedStore.name}</h1>
            <StatusDot tone={selectedStore.isActive && !isSubscriptionExpired ? "success" : "danger"}>
              {!selectedStore.isActive ? "Витрина выключена" : isSubscriptionExpired ? "Подписка истекла" : "Витрина работает"}
            </StatusDot>
          </div>
          <div className={styles.heroIcons}>
            {stores.length > 1 && <IconButtonLink icon={Exchange01Icon} label="Сменить магазин" to="/dashboard" state={{ showAll: true }} />}
            <IconButtonLink icon={Settings01Icon} label="Реквизиты магазина" to={`/dashboard/stores/${selectedStore.id}/settings`} />
          </div>
        </div>
        <div className={styles.primaryActions}>
          <ButtonLink variant="primary" size="lg" icon={PlusSignIcon} to={`/dashboard/stores/${selectedStore.id}/products/new`}>
            Добавить товар
          </ButtonLink>
          {Boolean(selectedStore.aiFormEnabled) && (
            <Button variant="secondary" size="lg" icon={PlusSignIcon} onClick={() => setBulkCreatorOpen(true)}>
              Добавить много товаров
            </Button>
          )}
        </div>
        <div className={styles.heroLink}>
          <span className={styles.linkLabel}>
            <Icon icon={Link04Icon} size="sm" />
            Ссылка на витрину
          </span>
          <PublicLink store={selectedStore} url={publicStoreUrl} />
        </div>
        <p className={styles.summary}>
          <Icon icon={EyeIcon} size="sm" />
          Витрину посмотрели {analytics.storeViews} {timesWord} · на витрине {stats.visible} из {products.length} {productWord}
        </p>
      </Card>

      {!selectedStore.isActive && (
        <Notice tone="warning" title="Витрина выключена">
          Покупатели сейчас её не видят. Обратитесь к администратору, чтобы включить магазин.
        </Notice>
      )}

      {Boolean(selectedStore.isActive) && isSubscriptionExpired && (
        <Notice tone="danger" title="Подписка истекла">
          Покупатели не смогут открыть витрину, пока администратор не продлит подписку.
        </Notice>
      )}

      {productsState === "ready" && <LaunchChecklist store={selectedStore} productCount={products.length} publicUrl={publicStoreUrl} />}
      <InstallHint />

      <section className={styles.products} aria-labelledby="products-title">
        <div className={styles.productsHead}>
          <h2 id="products-title" className={styles.productsTitle}>
            Товары <span className={styles.productsCount}>{products.length}</span>
          </h2>
          <Button
            variant="ghost"
            size="sm"
            iconEnd={ArrowDown01Icon}
            className={cx(styles.moreToggle, isMoreOpen && styles.moreOpen)}
            aria-expanded={isMoreOpen}
            onClick={() => setIsMoreOpen((current) => !current)}
          >
            {isMoreOpen ? "Скрыть фильтры" : "Ещё: фильтры и статистика"}
          </Button>
        </div>

        {products.length > 4 && (
          <Input icon={Search01Icon} aria-label="Поиск товара" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти товар по названию" />
        )}

        {isMoreOpen && (
          <Card className={styles.more}>
            <div className={styles.stats}>
              <Stat icon={Package01Icon} label="Всего товаров" value={analytics.productCount || products.length} />
              <Stat icon={ViewIcon} label="На витрине" value={stats.visible} />
              <Stat icon={ViewOffSlashIcon} label="Скрыто" value={stats.hidden} />
              <Stat icon={PackageRemoveIcon} label="Нет в наличии" value={stats.unavailable} />
              <Stat icon={EyeIcon} label="Просмотры витрины" value={analytics.storeViews} />
              <Stat icon={Analytics01Icon} label="Просмотры товаров" value={analytics.productViews} />
            </div>
            <div className={styles.filters}>
              <Field label="Показывать" className={styles.filter}>
                <Select
                  value={listFilter}
                  onChange={(value) => setListFilter(value as ListFilter)}
                  options={[
                    { value: "all", label: "Все товары" },
                    { value: "visible", label: "На витрине" },
                    { value: "hidden", label: "Скрытые" },
                    { value: "unavailable", label: "Нет в наличии" }
                  ]}
                />
              </Field>
              <Field label="Категория" className={styles.filter}>
                <Select
                  value={categoryFilter}
                  onChange={setCategoryFilter}
                  options={[{ value: "all", label: "Все" }, ...categories.map((category) => ({ value: category, label: category }))]}
                />
              </Field>
              <Field label="Сортировка" className={styles.filter}>
                <Select
                  value={sort}
                  onChange={setSort}
                  options={[
                    { value: "new", label: "Сначала новые" },
                    { value: "old", label: "Сначала старые" },
                    { value: "price-asc", label: "Сначала дешевле" },
                    { value: "price-desc", label: "Сначала дороже" }
                  ]}
                />
              </Field>
            </div>
          </Card>
        )}

        {productsState === "loading" && <LoadingState label="Загружаем товары…" />}
        {productsState === "error" && <ErrorState description="Не удалось загрузить товары." onRetry={loadProducts} />}
        {productsState === "ready" &&
          (filteredProducts.length ? (
            <div className={styles.list}>
              {filteredProducts.map((product) => (
                <OwnerProductItem
                  key={product.id}
                  product={product}
                  storeId={selectedStore.id}
                  storeSlug={selectedStore.slug}
                  onUpdated={replaceProduct}
                  onEditPrice={setProductToReprice}
                  onDelete={setProductToDelete}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title={products.length ? "Ничего не найдено" : "Товаров пока нет"}
              description={products.length ? "Измените поиск или фильтры." : "Сфотографируйте первый товар — это займёт минуту."}
              action={
                !products.length && (
                  <ButtonLink variant="primary" size="lg" icon={PlusSignIcon} to={`/dashboard/stores/${selectedStore.id}/products/new`}>
                    Добавить товар
                  </ButtonLink>
                )
              }
            />
          ))}
      </section>

      {productToDelete && (
        <ConfirmModal
          title="Удалить товар?"
          description={`Товар «${productToDelete.title}» исчезнет из кабинета и с витрины. Если товар просто закончился, лучше отметьте «Нет в наличии» или скройте его.`}
          confirmLabel="Удалить"
          danger
          onCancel={() => setProductToDelete(null)}
          onConfirm={deleteProduct}
        />
      )}
      {productToReprice && (
        <PriceModal product={productToReprice} storeId={selectedStore.id} onClose={() => setProductToReprice(null)} onSaved={replaceProduct} />
      )}
      {bulkCreatorOpen && <BulkProductCreator storeId={selectedStore.id} onClose={() => setBulkCreatorOpen(false)} onComplete={loadProducts} />}
    </Page>
  );
}
