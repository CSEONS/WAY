import {
  Analytics01Icon,
  Archive02Icon,
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Copy01Icon,
  Delete02Icon,
  Edit02Icon,
  Exchange01Icon,
  EyeIcon,
  Home01Icon,
  InformationCircleIcon,
  Link04Icon,
  Package01Icon,
  PlusSignIcon,
  Search01Icon,
  Settings01Icon,
  ShoppingBag01Icon,
  Store01Icon
} from "@hugeicons/core-free-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { api } from "../api/client";
import { BulkProductCreator } from "../components/BulkProductCreator";
import { QrShareButton } from "../components/QrShareButton";
import type { Product, Store } from "../types/models";
import {
  Badge,
  Breadcrumbs,
  Button,
  ButtonLink,
  Card,
  ConfirmModal,
  EmptyState,
  ErrorState,
  Field,
  Icon,
  IconButton,
  IconButtonLink,
  Input,
  LoadingState,
  Notice,
  Page,
  PageHeader,
  Select,
  Stat,
  StatusDot,
  useCopyToClipboard,
  type Tone
} from "../ui";
import styles from "./DashboardPage.module.css";

type OwnerProductStatus = "published" | "draft" | "archive";
type StoreAnalytics = { productCount: number; storeViews: number; productViews: number };

const emptyAnalytics: StoreAnalytics = { productCount: 0, storeViews: 0, productViews: 0 };

function formatStoreDate(value?: string | null) {
  if (!value) return "Дата создания не указана";
  return `Магазин создан ${new Date(value).toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  })}`;
}

function productOwnerStatus(product: Product): OwnerProductStatus {
  if (product.status === "NOT_AVAILABLE") return "archive";
  return product.isVisible ? "published" : "draft";
}

const statusLabels: Record<OwnerProductStatus, string> = { published: "Опубликован", draft: "Черновик", archive: "Архив" };
const statusTones: Record<OwnerProductStatus, Tone> = { published: "success", draft: "warning", archive: "neutral" };

function productPrice(product: Product) {
  if (product.priceText) return product.priceText;
  if (product.price != null) return `${product.price.toLocaleString("ru-RU")} ₽`;
  const prices = product.variants.map((variant) => variant.price).filter((price): price is number => price != null);
  return prices.length ? `${Math.min(...prices).toLocaleString("ru-RU")} ₽` : "Цена в магазине";
}

function productDetails(product: Product) {
  if (product.sizes.length) return `Размеры: ${product.sizes.map((size) => size.value).join(", ")}`;
  if (product.colors.length) return `Цвета: ${product.colors.map((color) => color.name).join(", ")}`;
  return product.description || "Без параметров";
}

function formatProductDate(value?: string | null) {
  if (!value) return "Не указано";
  return new Date(value).toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function ProductThumb({ product }: { product: Product }) {
  const image = product.images[0];
  return <span className={styles.thumb}>{image ? <img src={image.url} alt="" loading="lazy" /> : product.title.slice(0, 1)}</span>;
}

function StoreAvatar({ store }: { store: Store }) {
  return (
    <span className={styles.avatar}>
      {store.logoUrl ? <img src={store.logoUrl} alt="" /> : <Icon icon={Store01Icon} size="md" strokeWidth={1.6} />}
    </span>
  );
}

function PublicLink({ url, slug }: { url: string; slug: string }) {
  const copy = useCopyToClipboard();
  return (
    <div className={styles.linkValue}>
      <a className={styles.link} href={`/m/${slug}`}>
        {url}
      </a>
      <div className={styles.linkActions}>
        <Button variant="neutral" size="sm" icon={Copy01Icon} onClick={() => copy(url, "Ссылка скопирована")}>
          Копировать
        </Button>
        <QrShareButton url={url} label="QR" />
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
          Публичная ссылка
        </span>
        <PublicLink url={publicUrl} slug={store.slug} />
        <p className={styles.hint}>Эта ссылка доступна для всех пользователей</p>
      </div>
      <div className={styles.storeActions}>
        <ButtonLink variant="primary" icon={ShoppingBag01Icon} iconEnd={ArrowRight01Icon} to={`/dashboard/stores/${store.id}`}>
          Выбрать магазин
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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | OwnerProductStatus>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sort, setSort] = useState("new");
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [bulkCreatorOpen, setBulkCreatorOpen] = useState(false);
  const selectedStore = stores.find((store) => store.id === storeId);
  const publicStoreUrl = selectedStore ? `${location.origin}/m/${selectedStore.slug}` : "";
  const isStoreProfileIncomplete = Boolean(
    selectedStore && (!selectedStore.description || !selectedStore.logoUrl || !selectedStore.phone || (!selectedStore.whatsapp && !selectedStore.telegram))
  );
  const isSubscriptionExpired = Boolean(selectedStore?.subscriptionEndsAt && new Date(selectedStore.subscriptionEndsAt).getTime() < Date.now());

  const categories = useMemo(
    () => [...new Set(products.map((product) => product.category).filter((category): category is string => Boolean(category)))],
    [products]
  );

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    const nextProducts = products.filter((product) => {
      const status = productOwnerStatus(product);
      const matchesSearch = !query || product.title.toLowerCase().includes(query);
      const matchesStatus = statusFilter === "all" || status === statusFilter;
      const matchesCategory = categoryFilter === "all" || product.category === categoryFilter;
      return matchesSearch && matchesStatus && matchesCategory;
    });

    return nextProducts.sort((left, right) => {
      if (sort === "old") return new Date(left.updatedAt ?? left.createdAt).getTime() - new Date(right.updatedAt ?? right.createdAt).getTime();
      if (sort === "price-asc") return (left.price ?? 0) - (right.price ?? 0);
      if (sort === "price-desc") return (right.price ?? 0) - (left.price ?? 0);
      return new Date(right.updatedAt ?? right.createdAt).getTime() - new Date(left.updatedAt ?? left.createdAt).getTime();
    });
  }, [categoryFilter, products, search, sort, statusFilter]);

  const stats = useMemo(() => {
    const published = products.filter((product) => productOwnerStatus(product) === "published").length;
    const draft = products.filter((product) => productOwnerStatus(product) === "draft").length;
    const archive = products.filter((product) => productOwnerStatus(product) === "archive").length;
    return { total: products.length, published, draft, archive };
  }, [products]);

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

  useEffect(() => {
    if (!storeId) {
      setProducts([]);
      setAnalytics(emptyAnalytics);
      return;
    }

    let ignore = false;
    Promise.all([
      api.get<Product[]>(`/owner/stores/${storeId}/products`),
      api.get<StoreAnalytics>(`/owner/stores/${storeId}/analytics`)
    ]).then(([productsRes, analyticsRes]) => {
      if (ignore) return;
      setProducts(productsRes.data);
      setAnalytics(analyticsRes.data);
    });
    return () => {
      ignore = true;
    };
  }, [storeId]);

  async function deleteProduct() {
    if (!storeId || !productToDelete) return;
    await api.delete(`/owner/stores/${storeId}/products/${productToDelete.id}`);
    setProducts((current) => current.filter((product) => product.id !== productToDelete.id));
    setProductToDelete(null);
  }

  async function reloadProducts() {
    if (!storeId) return;
    const [productsRes, analyticsRes] = await Promise.all([
      api.get<Product[]>(`/owner/stores/${storeId}/products`),
      api.get<StoreAnalytics>(`/owner/stores/${storeId}/analytics`)
    ]);
    setProducts(productsRes.data);
    setAnalytics(analyticsRes.data);
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
        <PageHeader title="Кабинет владельца" description="Сначала выберите магазин, затем добавляйте товары или меняйте реквизиты." />
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

  return (
    <Page className={styles.page}>
      <Breadcrumbs
        items={[
          { label: "К выбору магазина", icon: Home01Icon, to: "/dashboard", state: { showAll: true } },
          { label: "Магазины", to: "/dashboard", state: { showAll: true } },
          { label: selectedStore.name }
        ]}
      />

      <Card padding="lg" className={styles.hero}>
        <div className={styles.heroTop}>
          <div className={styles.heroBody}>
            <h1 className={styles.heroTitle}>{selectedStore.name}</h1>
            <StatusDot tone={selectedStore.isActive ? "success" : "neutral"}>{selectedStore.isActive ? "Активен" : "В архиве"}</StatusDot>
            <div className={styles.heroLink}>
              <span className={styles.linkLabel}>Публичная ссылка:</span>
              <PublicLink url={publicStoreUrl} slug={selectedStore.slug} />
            </div>
          </div>
          <div className={styles.heroIcons}>
            {stores.length > 1 && <IconButtonLink icon={Exchange01Icon} label="Сменить магазин" to="/dashboard" state={{ showAll: true }} />}
            <IconButtonLink icon={Settings01Icon} label="Реквизиты магазина" to={`/dashboard/stores/${selectedStore.id}/settings`} />
          </div>
        </div>
        <div className={styles.toolbar}>
          <ButtonLink variant="primary" icon={PlusSignIcon} to={`/dashboard/stores/${selectedStore.id}/products/new`}>
            Добавить товар
          </ButtonLink>
          {Boolean(selectedStore.aiFormEnabled) && (
            <Button variant="secondary" icon={PlusSignIcon} onClick={() => setBulkCreatorOpen(true)}>
              Добавить много товаров
            </Button>
          )}
        </div>
      </Card>

      {!selectedStore.isActive && (
        <Notice tone="warning" title="Магазин архивирован">
          Публичная витрина сейчас недоступна. Обратитесь к администратору, чтобы восстановить магазин.
        </Notice>
      )}

      {Boolean(selectedStore.isActive) && isSubscriptionExpired && (
        <Notice tone="danger" title="Подписка истекла">
          Клиенты не смогут открыть витрину, пока администратор не продлит подписку.
        </Notice>
      )}

      {Boolean(selectedStore.isActive) && !isSubscriptionExpired && isStoreProfileIncomplete && (
        <Card className={styles.setup}>
          <div className={styles.setupHead}>
            <h2 className={styles.setupTitle}>Запустите магазин</h2>
            <p className={styles.setupText}>Закройте базовые шаги, чтобы витрина выглядела готовой для клиентов.</p>
          </div>
          <ol className={styles.setupSteps}>
            {["Заполните информацию о магазине", "Загрузите логотип", "Добавьте первый товар", "Скопируйте ссылку"].map((step, index) => (
              <li key={step}>
                <span>{index + 1}</span>
                {step}
              </li>
            ))}
          </ol>
        </Card>
      )}

      <div className={styles.stats}>
        <Stat icon={Package01Icon} label="Всего товаров" value={analytics.productCount || stats.total} />
        <Stat icon={CheckmarkCircle02Icon} label="Опубликовано" value={stats.published} />
        <Stat icon={Clock01Icon} label="Черновики" value={stats.draft} />
        <Stat icon={Archive02Icon} label="Архив" value={stats.archive} />
        <Stat icon={EyeIcon} label="Просмотры магазина" value={analytics.storeViews} />
        <Stat icon={Analytics01Icon} label="Просмотры товаров" value={analytics.productViews} />
      </div>

      <Card className={styles.filters}>
        <Field label="Поиск" className={styles.filter}>
          <Input icon={Search01Icon} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск товара…" />
        </Field>
        <Field label="Статус" className={styles.filter}>
          <Select
            value={statusFilter}
            onChange={(value) => setStatusFilter(value as "all" | OwnerProductStatus)}
            options={[
              { value: "all", label: "Все" },
              { value: "published", label: "Опубликован" },
              { value: "draft", label: "Черновик" },
              { value: "archive", label: "Архив" }
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
              { value: "price-asc", label: "Цена по возрастанию" },
              { value: "price-desc", label: "Цена по убыванию" }
            ]}
          />
        </Field>
      </Card>

      <Card padding="sm" className={styles.table}>
        {filteredProducts.length > 0 && (
          <div className={styles.tableHead} aria-hidden="true">
            <span>Товар</span>
            <span>Статус</span>
            <span>Цена</span>
            <span>Категория</span>
            <span>Обновлён</span>
            <span>Действия</span>
          </div>
        )}
        {filteredProducts.map((product) => {
          const status = productOwnerStatus(product);
          return (
            <div className={styles.row} key={product.id}>
              <div className={styles.rowMain}>
                <ProductThumb product={product} />
                <div className={styles.rowTitle}>
                  <Link to={`/m/${selectedStore.slug}/p/${product.id}`}>{product.title}</Link>
                  <small>{productDetails(product)}</small>
                </div>
              </div>
              <span className={styles.cellStatus}>
                <Badge tone={statusTones[status]}>{statusLabels[status]}</Badge>
              </span>
              <span className={styles.cell}>{productPrice(product)}</span>
              <span className={styles.cell}>{product.category || "Без категории"}</span>
              <span className={styles.cellUpdated}>{formatProductDate(product.updatedAt ?? product.createdAt)}</span>
              <div className={styles.rowActions}>
                <IconButtonLink icon={Edit02Icon} label="Редактировать товар" to={`/dashboard/stores/${selectedStore.id}/products/${product.id}/edit`} />
                <IconButton icon={Delete02Icon} label="Удалить товар" variant="danger" onClick={() => setProductToDelete(product)} />
              </div>
            </div>
          );
        })}
        {!filteredProducts.length && (
          <EmptyState
            title={products.length ? "Товары не найдены" : "Нет товаров"}
            description={products.length ? "Попробуйте изменить поиск, фильтры или сортировку." : "Добавьте первый товар, чтобы витрина начала наполняться."}
            action={
              !products.length && (
                <ButtonLink variant="primary" icon={PlusSignIcon} to={`/dashboard/stores/${selectedStore.id}/products/new`}>
                  Добавить товар
                </ButtonLink>
              )
            }
          />
        )}
      </Card>

      {filteredProducts.length > 0 && (
        <p className={styles.count}>
          Показано {filteredProducts.length} из {products.length}
        </p>
      )}
      {productToDelete && (
        <ConfirmModal
          title="Удалить товар?"
          description={`Товар "${productToDelete.title}" исчезнет из кабинета и публичной витрины. Это действие нельзя отменить.`}
          confirmLabel="Удалить"
          danger
          onCancel={() => setProductToDelete(null)}
          onConfirm={deleteProduct}
        />
      )}
      {bulkCreatorOpen && <BulkProductCreator storeId={selectedStore.id} onClose={() => setBulkCreatorOpen(false)} onComplete={reloadProducts} />}
    </Page>
  );
}
