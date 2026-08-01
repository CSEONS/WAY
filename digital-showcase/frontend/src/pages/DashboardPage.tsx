import { HugeiconsIcon } from "@hugeicons/react";
import {
  Analytics01Icon,
  Archive02Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Copy01Icon,
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
  Store01Icon,
  Delete02Icon
} from "@hugeicons/core-free-icons";
import { ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { api } from "../api/client";
import { ConfirmModal } from "../components/ConfirmModal";
import { BulkProductCreator } from "../components/BulkProductCreator";
import { EmptyState } from "../components/EmptyState";
import { QrShareButton } from "../components/QrShareButton";
import { Select } from "../components/Select";
import { Toast } from "../components/Toast";
import type { Product, Store } from "../types/models";

type OwnerProductStatus = "published" | "draft" | "archive";
type StoreAnalytics = { productCount: number; storeViews: number; productViews: number };

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

function productStatusLabel(status: OwnerProductStatus) {
  return status === "published" ? "Опубликован" : status === "draft" ? "Черновик" : "Архив";
}

function productStatusBadgeClass(status: OwnerProductStatus) {
  if (status === "published") return "badge badge-success";
  if (status === "draft") return "badge badge-warning";
  return "badge badge-neutral";
}

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
  return (
    <span className="product-thumb">
      {image ? <img src={image.url} alt="" /> : product.title.slice(0, 1)}
    </span>
  );
}

function StoreChoiceCard({ store }: { store: Store }) {
  const [isCopied, setIsCopied] = useState(false);
  const publicUrl = `${location.origin}/m/${store.slug}`;

  async function copyPublicUrl() {
    await navigator.clipboard?.writeText(publicUrl);
    setIsCopied(true);
    window.setTimeout(() => setIsCopied(false), 1600);
  }

  return (
    <article className="store-card">
      <div className="store-card-head">
        <div className="store-avatar">
          {store.logoUrl ? <img src={store.logoUrl} alt="" /> : <HugeiconsIcon icon={Store01Icon} size={20} strokeWidth={1.6} />}
        </div>
        <div className="store-card-title">
          <h2>{store.name}</h2>
          <span className="store-status">
            <span className={`status-dot ${store.isActive ? "is-on" : "is-off"}`} />
            {store.isActive ? "Активен" : "В архиве"}
          </span>
        </div>
      </div>

      <div className="store-link-row">
        <div className="store-link-label">
          <HugeiconsIcon icon={Link04Icon} size={15} strokeWidth={1.8} />
          <span>Публичная ссылка</span>
        </div>
        <div className="store-link-value">
          <a href={`/m/${store.slug}`}>{publicUrl}</a>
          <div className="store-link-actions">
            <button type="button" className="btn btn-neutral btn-sm" onClick={copyPublicUrl}>
              <HugeiconsIcon icon={Copy01Icon} size={15} strokeWidth={1.8} />
              Копировать
            </button>
            <QrShareButton url={publicUrl} label="QR" />
          </div>
        </div>
        <p className="store-hint">Эта ссылка доступна для всех пользователей</p>
        {isCopied && <Toast message="Ссылка скопирована" />}
        <div className="store-card-actions">
          <Link className="btn btn-primary" to={`/dashboard/stores/${store.id}`}>
            <HugeiconsIcon icon={ShoppingBag01Icon} size={16} strokeWidth={1.8} />
            <span>Выбрать магазин</span>
            <ChevronRight size={16} strokeWidth={2} />
          </Link>
          <Link className="btn btn-secondary" to={`/dashboard/stores/${store.id}/settings`}>
            <HugeiconsIcon icon={Settings01Icon} size={16} strokeWidth={1.8} />
            <span>Реквизиты</span>
          </Link>
        </div>
        <div className="store-meta">
          <HugeiconsIcon icon={InformationCircleIcon} size={15} strokeWidth={1.8} />
          <span>{formatStoreDate(store.createdAt)}</span>
        </div>
      </div>
    </article>
  );
}

export function DashboardPage() {
  const { storeId } = useParams();
  const routerLocation = useLocation();
  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [analytics, setAnalytics] = useState<StoreAnalytics>({ productCount: 0, storeViews: 0, productViews: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | OwnerProductStatus>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sort, setSort] = useState("new");
  const [copiedPublicUrl, setCopiedPublicUrl] = useState(false);
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

  useEffect(() => {
    let ignore = false;
    setIsLoading(true);
    api.get<Store[]>("/owner/stores").then((res) => {
      if (ignore) return;
      setStores(res.data);
      setIsLoading(false);
    });
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!storeId) {
      setProducts([]);
      setAnalytics({ productCount: 0, storeViews: 0, productViews: 0 });
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

  async function copySelectedStoreUrl() {
    if (!publicStoreUrl) return;
    await navigator.clipboard?.writeText(publicStoreUrl);
    setCopiedPublicUrl(true);
    window.setTimeout(() => setCopiedPublicUrl(false), 1600);
  }

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

  if (isLoading) return <section className="page page-dashboard">Загрузка...</section>;

  if (!storeId) {
    if (stores.length === 1 && !(routerLocation.state as { showAll?: boolean } | null)?.showAll) {
      return <Navigate to={`/dashboard/stores/${stores[0].id}`} replace />;
    }

    return (
      <section className="page page-dashboard">
        <div className="dashboard-intro">
          <h1>Кабинет владельца</h1>
          <p>Сначала выберите магазин, затем добавляйте товары или меняйте реквизиты.</p>
        </div>

        {stores.length ? (
          <div className="store-grid">
            {stores.map((store) => (
              <StoreChoiceCard store={store} key={store.id} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Магазин еще не создан"
            description="Администратор должен создать магазин и привязать его к вашему аккаунту."
          />
        )}
      </section>
    );
  }

  if (!selectedStore) {
    return (
      <section className="page page-dashboard">
        <EmptyState
          title="Магазин недоступен"
          description="Магазин не найден или больше не привязан к вашему аккаунту."
          action={
            <Link className="btn btn-primary" to="/dashboard" state={{ showAll: true }}>
              Вернуться к выбору магазина
            </Link>
          }
        />
      </section>
    );
  }

  return (
    <section className="page page-dashboard">
      <div className="breadcrumbs">
        <Link to="/dashboard" state={{ showAll: true }} aria-label="К выбору магазина">
          <HugeiconsIcon icon={Home01Icon} size={16} strokeWidth={1.8} />
        </Link>
        <ChevronRight size={14} strokeWidth={2} />
        <Link to="/dashboard" state={{ showAll: true }}>Магазины</Link>
        <ChevronRight size={14} strokeWidth={2} />
        <span className="crumb-current">{selectedStore.name}</span>
      </div>

      <div className="dashboard-hero">
        <div className="dashboard-hero-top">
          <div className="dashboard-hero-identity">
            <div className="dashboard-hero-body">
              <div className="dashboard-hero-name">
                <h1>{selectedStore.name}</h1>
              </div>
              <span className="store-status">
                <span className={`status-dot ${selectedStore.isActive ? "is-on" : "is-off"}`} />
                {selectedStore.isActive ? "Активен" : "В архиве"}
              </span>
              <div className="store-link-value">
                <span>Публичная ссылка:</span>
                <a href={`/m/${selectedStore.slug}`}>{publicStoreUrl}</a>
                <div className="store-link-actions">
                  <button type="button" className="btn btn-neutral btn-sm" onClick={copySelectedStoreUrl}>
                    <HugeiconsIcon icon={Copy01Icon} size={15} strokeWidth={1.8} />
                    Копировать
                  </button>
                  <QrShareButton url={publicStoreUrl} label="QR" />
                </div>
              </div>
              {copiedPublicUrl && <Toast message="Ссылка скопирована" />}
            </div>
          </div>
          <div className="dashboard-hero-icon-actions">
            {stores.length > 1 && (
              <Link className="btn-icon btn-ghost" to="/dashboard" state={{ showAll: true }} aria-label="Сменить магазин">
                <HugeiconsIcon icon={Exchange01Icon} size={18} strokeWidth={1.8} />
              </Link>
            )}
            <Link className="btn-icon btn-ghost" to={`/dashboard/stores/${selectedStore.id}/settings`} aria-label="Реквизиты магазина">
              <HugeiconsIcon icon={Settings01Icon} size={18} strokeWidth={1.8} />
            </Link>
          </div>
        </div>
        <div className="dashboard-toolbar">
          <Link className="btn btn-primary" to={`/dashboard/stores/${selectedStore.id}/products/new`}>
            <HugeiconsIcon icon={PlusSignIcon} size={16} strokeWidth={1.8} />
            Добавить товар
          </Link>
          {Boolean(selectedStore.aiFormEnabled) && (
            <button type="button" className="btn btn-secondary" onClick={() => setBulkCreatorOpen(true)}>
              <HugeiconsIcon icon={PlusSignIcon} size={16} strokeWidth={1.8} />
              Добавить много товаров
            </button>
          )}
        </div>
      </div>

      {!selectedStore.isActive && (
        <EmptyState
          title="Магазин архивирован"
          description="Публичная витрина сейчас недоступна. Обратитесь к администратору, чтобы восстановить магазин."
        />
      )}

      {selectedStore.isActive && isSubscriptionExpired && (
        <EmptyState
          title="Подписка истекла"
          description="Клиенты не смогут открыть витрину, пока администратор не продлит подписку."
        />
      )}

      {selectedStore.isActive && !isSubscriptionExpired && isStoreProfileIncomplete && (
        <div className="setup-card">
          <div className="setup-card-head">
            <h2>Запустите магазин</h2>
            <p>Закройте базовые шаги, чтобы витрина выглядела готовой для клиентов.</p>
          </div>
          <ol className="setup-steps">
            <li>
              <span>1</span>
              Заполните информацию о магазине
            </li>
            <li>
              <span>2</span>
              Загрузите логотип
            </li>
            <li>
              <span>3</span>
              Добавьте первый товар
            </li>
            <li>
              <span>4</span>
              Скопируйте ссылку
            </li>
          </ol>
        </div>
      )}

      <div className="stat-grid">
        <div className="stat-tile">
          <span className="stat-tile-icon"><HugeiconsIcon icon={Package01Icon} size={16} strokeWidth={1.8} /></span>
          <small>Всего товаров</small>
          <strong>{analytics.productCount || stats.total}</strong>
        </div>
        <div className="stat-tile">
          <span className="stat-tile-icon"><HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} strokeWidth={1.8} /></span>
          <small>Опубликовано</small>
          <strong>{stats.published}</strong>
        </div>
        <div className="stat-tile">
          <span className="stat-tile-icon"><HugeiconsIcon icon={Clock01Icon} size={16} strokeWidth={1.8} /></span>
          <small>Черновики</small>
          <strong>{stats.draft}</strong>
        </div>
        <div className="stat-tile">
          <span className="stat-tile-icon"><HugeiconsIcon icon={Archive02Icon} size={16} strokeWidth={1.8} /></span>
          <small>Архив</small>
          <strong>{stats.archive}</strong>
        </div>
        <div className="stat-tile">
          <span className="stat-tile-icon"><HugeiconsIcon icon={EyeIcon} size={16} strokeWidth={1.8} /></span>
          <small>Просмотры магазина</small>
          <strong>{analytics.storeViews}</strong>
        </div>
        <div className="stat-tile">
          <span className="stat-tile-icon"><HugeiconsIcon icon={Analytics01Icon} size={16} strokeWidth={1.8} /></span>
          <small>Просмотры товаров</small>
          <strong>{analytics.productViews}</strong>
        </div>
      </div>

      <div className="product-toolbar">
        <div className="product-toolbar-row">
          <label className="search-field">
            <span>Поиск</span>
            <span className="search-field-input">
              <HugeiconsIcon icon={Search01Icon} size={16} strokeWidth={1.8} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск товара..." />
            </span>
          </label>
          <label>
            <span>Статус</span>
            <Select
              ariaLabel="Статус"
              value={statusFilter}
              onChange={(value) => setStatusFilter(value as "all" | OwnerProductStatus)}
              options={[
                { value: "all", label: "Все" },
                { value: "published", label: "Опубликован" },
                { value: "draft", label: "Черновик" },
                { value: "archive", label: "Архив" }
              ]}
            />
          </label>
          <label>
            <span>Категория</span>
            <Select
              ariaLabel="Категория"
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={[{ value: "all", label: "Все" }, ...categories.map((category) => ({ value: category, label: category }))]}
            />
          </label>
          <label>
            <span>Сортировка</span>
            <Select
              ariaLabel="Сортировка"
              value={sort}
              onChange={setSort}
              options={[
                { value: "new", label: "Сначала новые" },
                { value: "old", label: "Сначала старые" },
                { value: "price-asc", label: "Цена по возрастанию" },
                { value: "price-desc", label: "Цена по убыванию" }
              ]}
            />
          </label>
        </div>
      </div>

      <div className="product-table">
        <div className="product-table-head">
          <span>Товар</span>
          <span>Статус</span>
          <span>Цена</span>
          <span>Категория</span>
          <span>Обновлен</span>
          <span>Действия</span>
        </div>
        {filteredProducts.map((product) => {
          const status = productOwnerStatus(product);
          return (
            <div className="product-row" key={product.id}>
              <div className="product-row-main">
                <ProductThumb product={product} />
                <div className="product-row-title">
                  <Link to={`/m/${selectedStore.slug}/p/${product.id}`}>{product.title}</Link>
                  <small>{productDetails(product)}</small>
                </div>
              </div>
              <span className="product-row-status"><span className={productStatusBadgeClass(status)}>{productStatusLabel(status)}</span></span>
              <span className="product-row-price">{productPrice(product)}</span>
              <span className="product-row-category">{product.category || "Без категории"}</span>
              <span className="product-row-updated">{formatProductDate(product.updatedAt ?? product.createdAt)}</span>
              <div className="product-row-actions">
                <Link className="btn-icon btn-ghost" to={`/dashboard/stores/${selectedStore.id}/products/${product.id}/edit`} aria-label="Редактировать товар">
                  <HugeiconsIcon icon={Edit02Icon} size={16} strokeWidth={1.8} />
                </Link>
                <button type="button" className="btn-icon btn-danger" aria-label="Удалить товар" onClick={() => setProductToDelete(product)}>
                  <HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={1.8} />
                </button>
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
                <Link className="btn btn-primary" to={`/dashboard/stores/${selectedStore.id}/products/new`}>
                  <HugeiconsIcon icon={PlusSignIcon} size={16} strokeWidth={1.8} />
                  Добавить товар
                </Link>
              )
            }
          />
        )}
      </div>

      {Boolean(filteredProducts.length) && (
        <div className="pagination-bar">
          <span>Показано {filteredProducts.length} из {products.length}</span>
        </div>
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
    </section>
  );
}
