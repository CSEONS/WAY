import {
  Analytics01Icon,
  ArrowRight01Icon,
  Calendar03Icon,
  CheckListIcon,
  CheckmarkCircle02Icon,
  Copy01Icon,
  Delete02Icon,
  Exchange01Icon,
  EyeIcon,
  Home01Icon,
  InformationCircleIcon,
  Link04Icon,
  Message01Icon,
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
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { api } from "../api/client";
import { InstallHint } from "../components/dashboard/InstallHint";
import { LaunchChecklist } from "../components/dashboard/LaunchChecklist";
import { OwnerProductItem } from "../components/dashboard/OwnerProductItem";
import { PriceModal } from "../components/dashboard/PriceModal";
import { markStoreShared } from "../components/dashboard/shareState";
import { QrShareButton } from "../components/QrShareButton";
import { useSavedProductCount } from "../state/backgroundJobs";
import type { Product, Store } from "../types/models";
import { plural } from "../utils/format";
import { canAddProducts, subscriptionBadge, subscriptionNotice } from "../utils/subscription";
import {
  Breadcrumbs,
  Button,
  ButtonLink,
  Card,
  Chip,
  ChipGroup,
  ConfirmModal,
  EmptyState,
  ErrorState,
  Icon,
  IconButtonLink,
  Input,
  LoadingState,
  Menu,
  Notice,
  Page,
  PageHeader,
  SegmentedControl,
  Select,
  Stat,
  StatusDot,
  useCopyToClipboard,
  useToast
} from "../ui";
import styles from "./DashboardPage.module.css";

type StoreAnalytics = { productCount: number; storeViews: number; productViews: number; contactClicks: number };
type ListFilter = "all" | "visible" | "hidden" | "unavailable";
type SectionView = "products" | "stats";
/** «Выбрать»: what can be done with several products at once (POST …/products/bulk). */
type BulkAction = "show" | "hide" | "available" | "unavailable" | "delete";

const listFilters: { value: ListFilter; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "visible", label: "На витрине" },
  { value: "hidden", label: "Скрытые" },
  { value: "unavailable", label: "Нет в наличии" }
];

/** What a bulk action changes in a product, to update the list without reloading it. */
const bulkChanges: Record<Exclude<BulkAction, "delete">, Partial<Product>> = {
  show: { isVisible: 1 },
  hide: { isVisible: 0 },
  available: { status: "AVAILABLE" },
  unavailable: { status: "NOT_AVAILABLE" }
};

const bulkDone: Record<BulkAction, string> = {
  show: "Вернули на витрину",
  hide: "Скрыли с витрины",
  available: "Отметили «в наличии»",
  unavailable: "Отметили «нет в наличии»",
  delete: "Удалили"
};

const emptyAnalytics: StoreAnalytics = { productCount: 0, storeViews: 0, productViews: 0, contactClicks: 0 };

const filterMatchers: Record<ListFilter, (product: Product) => boolean> = {
  all: () => true,
  visible: (product) => Boolean(product.isVisible),
  hidden: (product) => !product.isVisible,
  unavailable: (product) => product.status === "NOT_AVAILABLE"
};

function fetchProducts(storeId: string) {
  return Promise.all([api.get<Product[]>(`/owner/stores/${storeId}/products`), api.get<StoreAnalytics>(`/owner/stores/${storeId}/analytics`)]);
}

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
  const [view, setView] = useState<SectionView>("products");
  // «Выбрать»: ticked products and whether a bulk action is running.
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const toast = useToast();
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [productToReprice, setProductToReprice] = useState<Product | null>(null);
  const selectedStore = stores.find((store) => store.id === storeId);
  const publicStoreUrl = selectedStore ? `${location.origin}/m/${selectedStore.slug}` : "";
  const subscription = selectedStore?.subscription;
  const isSubscriptionExpired = subscription
    ? subscription.state === "expired"
    : Boolean(selectedStore?.subscriptionEndsAt && new Date(selectedStore.subscriptionEndsAt).getTime() < Date.now());
  const notice = subscriptionNotice(subscription);
  // Unpaid: the buttons stay visible but inactive, the banner above says why.
  const addingAllowed = canAddProducts(subscription);

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
      all: products.length,
      visible: products.filter(filterMatchers.visible).length,
      hidden: products.filter(filterMatchers.hidden).length,
      unavailable: products.filter(filterMatchers.unavailable).length
    }),
    [products]
  );

  // Another search or filter: what was ticked may be out of sight, so the choice starts over.
  useEffect(() => setSelectedIds(new Set()), [search, listFilter, categoryFilter, storeId]);

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
    fetchProducts(storeId)
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

  // Products saved in the background (the editor, bulk adding) appear on their own, without the list blinking.
  const savedProductCount = useSavedProductCount(storeId);
  useEffect(() => {
    if (!storeId || !savedProductCount) return;
    let ignore = false;
    fetchProducts(storeId)
      .then(([productsRes, analyticsRes]) => {
        if (ignore) return;
        setProducts(productsRes.data);
        setAnalytics(analyticsRes.data);
      })
      .catch(() => undefined);
    return () => {
      ignore = true;
    };
  }, [storeId, savedProductCount]);

  function replaceProduct(updated: Product) {
    setProducts((current) => current.map((product) => (product.id === updated.id ? updated : product)));
  }

  function toggleSelected(productId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function stopSelecting() {
    setIsSelecting(false);
    setSelectedIds(new Set());
  }

  async function runBulk(action: BulkAction) {
    if (!storeId) return;
    const ids = [...selectedIds];
    if (!ids.length) {
      toast.show("Сначала отметьте товары");
      return;
    }
    setBulkAction(action);
    try {
      const { data } = await api.post<{ ids: string[] }>(`/owner/stores/${storeId}/products/bulk`, { ids, action });
      const touched = new Set(data.ids);
      const now = new Date().toISOString();
      setProducts((current) =>
        action === "delete"
          ? current.filter((product) => !touched.has(product.id))
          : current.map((product) => (touched.has(product.id) ? { ...product, ...bulkChanges[action], updatedAt: now } : product))
      );
      toast.show(`${bulkDone[action]}: ${data.ids.length} ${plural(data.ids.length, ["товар", "товара", "товаров"])}`, { tone: "success" });
      stopSelecting();
    } catch (err: any) {
      toast.show(err?.response?.data?.message ?? "Не удалось изменить товары. Попробуйте ещё раз.", { tone: "danger" });
    } finally {
      setBulkAction(null);
      setIsBulkDeleteOpen(false);
    }
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
  const contactWord = plural(analytics.contactClicks, ["раз", "раза", "раз"]);

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
            <StatusDot tone={!selectedStore.isActive || isSubscriptionExpired || subscription?.state === "grace" ? "danger" : subscription?.state === "expiring" ? "warning" : "success"}>
              {!selectedStore.isActive
                ? "Витрина выключена"
                : isSubscriptionExpired
                  ? "Витрина отключена: подписка закончилась"
                  : subscription?.state === "grace"
                    ? "Подписка закончилась, витрина пока работает"
                    : "Витрина работает"}
            </StatusDot>
          </div>
          <div className={styles.heroIcons}>
            {stores.length > 1 && <IconButtonLink icon={Exchange01Icon} label="Сменить магазин" to="/dashboard" state={{ showAll: true }} />}
            <IconButtonLink icon={Settings01Icon} label="Реквизиты магазина" to={`/dashboard/stores/${selectedStore.id}/settings`} />
          </div>
        </div>
        <div className={styles.primaryActions}>
          {addingAllowed ? (
            <ButtonLink variant="primary" size="lg" icon={PlusSignIcon} to={`/dashboard/stores/${selectedStore.id}/products/new`}>
              Добавить товар
            </ButtonLink>
          ) : (
            <Button variant="primary" size="lg" icon={PlusSignIcon} disabled title="Новые товары можно добавлять после продления подписки">
              Добавить товар
            </Button>
          )}
          {Boolean(selectedStore.aiFormEnabled) &&
            (addingAllowed ? (
              <ButtonLink variant="secondary" size="lg" icon={PlusSignIcon} to={`/dashboard/stores/${selectedStore.id}/products/bulk`}>
                Добавить много товаров
              </ButtonLink>
            ) : (
              <Button variant="secondary" size="lg" icon={PlusSignIcon} disabled>
                Добавить много товаров
              </Button>
            ))}
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
          Витрину посмотрели {analytics.storeViews} {timesWord}
          {analytics.contactClicks > 0 && ` · написали или позвонили ${analytics.contactClicks} ${contactWord}`} · на витрине {stats.visible} из{" "}
          {products.length} {productWord}
        </p>
        {subscription && subscription.state !== "disabled" && (
          <Link to={`/dashboard/stores/${selectedStore.id}/subscription`} className={styles.subscriptionLink}>
            <Icon icon={Calendar03Icon} size="sm" />
            {subscriptionBadge(subscription).label}
            <span className={styles.subscriptionMore}>
              Подписка и итоги месяца
              <Icon icon={ArrowRight01Icon} size="xs" />
            </span>
          </Link>
        )}
      </Card>

      {!selectedStore.isActive && (
        <Notice tone="warning" title="Витрина выключена">
          Покупатели сейчас её не видят. Обратитесь к администратору, чтобы включить магазин.
        </Notice>
      )}

      {Boolean(selectedStore.isActive) && notice && (
        <Notice
          tone={notice.tone}
          title={notice.title}
          action={
            <ButtonLink variant="secondary" size="sm" to={`/dashboard/stores/${selectedStore.id}/subscription`}>
              Как продлить
            </ButtonLink>
          }
        >
          {notice.text}
        </Notice>
      )}

      {productsState === "ready" && <LaunchChecklist store={selectedStore} productCount={products.length} publicUrl={publicStoreUrl} />}
      <InstallHint />

      <section className={styles.products} aria-label="Товары и статистика">
        <SegmentedControl
          label="Что показать"
          value={view}
          onChange={(value) => {
            setView(value);
            stopSelecting();
          }}
          options={[
            { value: "products", label: `Товары · ${products.length}`, icon: Package01Icon },
            { value: "stats", label: "Статистика", icon: Analytics01Icon }
          ]}
          className={styles.viewSwitch}
        />

        {view === "stats" && (
          <Card className={styles.more}>
            <div className={styles.stats}>
              <Stat icon={Package01Icon} label="Всего товаров" value={analytics.productCount || products.length} />
              <Stat icon={ViewIcon} label="На витрине" value={stats.visible} />
              <Stat icon={ViewOffSlashIcon} label="Скрыто" value={stats.hidden} />
              <Stat icon={PackageRemoveIcon} label="Нет в наличии" value={stats.unavailable} />
              <Stat icon={EyeIcon} label="Просмотры витрины" value={analytics.storeViews} />
              <Stat icon={Analytics01Icon} label="Просмотры товаров" value={analytics.productViews} />
              <Stat icon={Message01Icon} label="Написали или позвонили" value={analytics.contactClicks} />
            </div>
            <Link to={`/dashboard/stores/${selectedStore.id}/subscription`} className={styles.statsMore}>
              Итоги по месяцам — в «Подписка и итоги»
              <Icon icon={ArrowRight01Icon} size="xs" />
            </Link>
          </Card>
        )}

        {view === "products" && productsState === "ready" && products.length > 0 && (
          <>
            <div className={styles.toolbar}>
              <Input
                icon={Search01Icon}
                aria-label="Поиск товара"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Найти товар по названию"
                className={styles.search}
              />
            </div>
            <ChipGroup label="Показывать" scroll>
              {listFilters.map((filter) => (
                <Chip key={filter.value} selected={listFilter === filter.value} count={stats[filter.value]} onClick={() => setListFilter(filter.value)}>
                  {filter.label}
                </Chip>
              ))}
            </ChipGroup>
            <div className={styles.filterRow}>
              <Select
                ariaLabel="Сортировка"
                value={sort}
                onChange={setSort}
                className={styles.sort}
                options={[
                  { value: "new", label: "Сначала новые" },
                  { value: "old", label: "Сначала старые" },
                  { value: "price-asc", label: "Сначала дешевле" },
                  { value: "price-desc", label: "Сначала дороже" }
                ]}
              />
              {categories.length > 0 && (
                <Select
                  ariaLabel="Категория"
                  value={categoryFilter}
                  onChange={setCategoryFilter}
                  className={styles.category}
                  options={[{ value: "all", label: "Все категории" }, ...categories.map((category) => ({ value: category, label: category }))]}
                />
              )}
            </div>
            <div className={styles.listHead}>
              <span className={styles.listCount}>
                {isSelecting
                  ? `Отмечено ${selectedIds.size} из ${filteredProducts.length}`
                  : `${filteredProducts.length} ${plural(filteredProducts.length, ["товар", "товара", "товаров"])}`}
              </span>
              {isSelecting ? (
                <div className={styles.listHeadActions}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setSelectedIds(selectedIds.size === filteredProducts.length ? new Set() : new Set(filteredProducts.map((product) => product.id)))
                    }
                  >
                    {selectedIds.size === filteredProducts.length ? "Снять все" : "Отметить все"}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={stopSelecting}>
                    Готово
                  </Button>
                </div>
              ) : (
                <Button variant="ghost" size="sm" icon={CheckListIcon} onClick={() => setIsSelecting(true)}>
                  Выбрать
                </Button>
              )}
            </div>
          </>
        )}

        {view === "products" && productsState === "loading" && <LoadingState label="Загружаем товары…" />}
        {view === "products" && productsState === "error" && <ErrorState description="Не удалось загрузить товары." onRetry={loadProducts} />}
        {view === "products" &&
          productsState === "ready" &&
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
                  selecting={isSelecting}
                  selected={selectedIds.has(product.id)}
                  onToggleSelect={() => toggleSelected(product.id)}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title={products.length ? "Ничего не найдено" : "Товаров пока нет"}
              description={products.length ? "Измените поиск или фильтры." : "Сфотографируйте первый товар — это займёт минуту."}
              action={
                !products.length &&
                addingAllowed && (
                  <ButtonLink variant="primary" size="lg" icon={PlusSignIcon} to={`/dashboard/stores/${selectedStore.id}/products/new`}>
                    Добавить товар
                  </ButtonLink>
                )
              }
            />
          ))}

        {isSelecting && (
          <div className={styles.bulkBar} role="region" aria-label="Действия с отмеченными товарами">
            <strong className={styles.bulkCount}>Отмечено: {selectedIds.size}</strong>
            <div className={styles.bulkActions}>
              <Button variant="secondary" size="sm" icon={ViewOffSlashIcon} loading={bulkAction === "hide"} disabled={bulkAction !== null} onClick={() => void runBulk("hide")}>
                Скрыть
              </Button>
              <Button variant="secondary" size="sm" icon={ViewIcon} loading={bulkAction === "show"} disabled={bulkAction !== null} onClick={() => void runBulk("show")}>
                На витрину
              </Button>
              <Menu
                label="Ещё действия с отмеченными товарами"
                items={[
                  { label: "В наличии", icon: CheckmarkCircle02Icon, onSelect: () => void runBulk("available") },
                  { label: "Нет в наличии", icon: PackageRemoveIcon, onSelect: () => void runBulk("unavailable") },
                  {
                    label: "Удалить",
                    icon: Delete02Icon,
                    danger: true,
                    onSelect: () => (selectedIds.size ? setIsBulkDeleteOpen(true) : toast.show("Сначала отметьте товары"))
                  }
                ]}
              />
            </div>
          </div>
        )}
      </section>

      {isBulkDeleteOpen && (
        <ConfirmModal
          title={`Удалить ${selectedIds.size} ${plural(selectedIds.size, ["товар", "товара", "товаров"])}?`}
          description="Они исчезнут из кабинета и с витрины вместе с фото. Если товары просто закончились или не продаются сейчас, лучше скройте их — потом вернёте одним нажатием."
          confirmLabel="Удалить"
          danger
          onCancel={() => setIsBulkDeleteOpen(false)}
          onConfirm={() => runBulk("delete")}
        />
      )}
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
    </Page>
  );
}
