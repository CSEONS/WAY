import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { Product, Store } from "../types/models";

type OwnerProductStatus = "published" | "draft" | "archive";

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

function StorefrontIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 10.5V20h16v-9.5" />
      <path d="M5 4h14l1.5 5.5a3 3 0 0 1-5.5 1.7 3 3 0 0 1-6 0 3 3 0 0 1-5.5-1.7L5 4Z" />
      <path d="M9 20v-6h6v6" />
    </svg>
  );
}

function StoreCardIcon({ type }: { type: "link" | "globe" | "copy" | "bag" | "edit" | "info" | "arrow" | "menu" }) {
  const paths = {
    link: (
      <>
        <path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L11 4.93" />
        <path d="M14 11a5 5 0 0 0-7.07 0L4.81 13.12a5 5 0 0 0 7.07 7.07L13 19.07" />
      </>
    ),
    globe: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18" />
        <path d="M12 3a14 14 0 0 1 0 18" />
        <path d="M12 3a14 14 0 0 0 0 18" />
      </>
    ),
    copy: (
      <>
        <rect x="8" y="8" width="11" height="11" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
      </>
    ),
    bag: (
      <>
        <path d="M6 8h12l-1 12H7L6 8Z" />
        <path d="M9 8a3 3 0 0 1 6 0" />
      </>
    ),
    edit: (
      <>
        <path d="m4 20 4.5-1 10-10a2.12 2.12 0 0 0-3-3l-10 10L4 20Z" />
        <path d="m13.5 6.5 4 4" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 10v6" />
        <path d="M12 7h.01" />
      </>
    ),
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    menu: (
      <>
        <circle cx="12" cy="5" r="1" />
        <circle cx="12" cy="12" r="1" />
        <circle cx="12" cy="19" r="1" />
      </>
    )
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {paths[type]}
    </svg>
  );
}

function OwnerIcon({ type }: { type: "home" | "swap" | "plus" | "cube" | "eye" | "clock" | "archive" | "search" | "filter" | "edit" | "menu" | "copy" }) {
  const paths = {
    home: (
      <>
        <path d="m3 11 9-8 9 8" />
        <path d="M5 10v10h14V10" />
        <path d="M9 20v-6h6v6" />
      </>
    ),
    swap: (
      <>
        <path d="M7 7h11m-3-3 3 3-3 3" />
        <path d="M17 17H6m3 3-3-3 3-3" />
      </>
    ),
    plus: (
      <>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </>
    ),
    cube: (
      <>
        <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
        <path d="m4 7.5 8 4.5 8-4.5" />
        <path d="M12 12v9" />
      </>
    ),
    eye: (
      <>
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    archive: (
      <>
        <path d="M4 7h16" />
        <path d="M6 7v12h12V7" />
        <path d="M9 11h6" />
        <path d="M7 4h10l1 3H6l1-3Z" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m16 16 4 4" />
      </>
    ),
    filter: (
      <>
        <path d="M4 7h16" />
        <path d="M7 12h10" />
        <path d="M10 17h4" />
      </>
    ),
    edit: (
      <>
        <path d="m4 20 4.5-1 10-10a2.12 2.12 0 0 0-3-3l-10 10L4 20Z" />
        <path d="m13.5 6.5 4 4" />
      </>
    ),
    menu: (
      <>
        <circle cx="12" cy="5" r="1" />
        <circle cx="12" cy="12" r="1" />
        <circle cx="12" cy="19" r="1" />
      </>
    ),
    copy: (
      <>
        <rect x="8" y="8" width="11" height="11" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
      </>
    )
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {paths[type]}
    </svg>
  );
}

function productOwnerStatus(product: Product): OwnerProductStatus {
  if (product.status === "NOT_AVAILABLE") return "archive";
  return product.isVisible ? "published" : "draft";
}

function productStatusLabel(status: OwnerProductStatus) {
  return status === "published" ? "Опубликован" : status === "draft" ? "Черновик" : "Архив";
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
  return image ? <img src={image.url} alt="" /> : <span>{product.title.slice(0, 1)}</span>;
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
    <article className="store-choice-card">
      <div className="store-choice-head">
        <div className="store-choice-logo">
          {store.logoUrl ? <img src={store.logoUrl} alt="" /> : <StorefrontIcon />}
        </div>
        <div className="store-choice-title">
          <h2>{store.name}</h2>
          <span className={store.isActive ? "status-pill active" : "status-pill"}>
            <span />
            {store.isActive ? "Активен" : "В архиве"}
          </span>
        </div>
        <button className="store-menu-button" type="button" aria-label={`Операции магазина ${store.name}`}>
          <StoreCardIcon type="menu" />
        </button>
      </div>

      <div className="store-choice-body">
        <div className="store-link-label">
          <StoreCardIcon type="link" />
          <span>Публичная ссылка</span>
        </div>
        <div className="store-public-link">
          <span className="store-public-link-icon">
            <StoreCardIcon type="globe" />
          </span>
          <a href={`/m/${store.slug}`}>{publicUrl}</a>
          <button type="button" onClick={copyPublicUrl} aria-label="Скопировать публичную ссылку">
            <StoreCardIcon type="copy" />
          </button>
        </div>
        <p className="store-link-note">{isCopied ? "Ссылка скопирована" : "Эта ссылка доступна для всех пользователей"}</p>
        <div className="store-choice-actions">
          <Link className="primary button-link store-select-button" to={`/dashboard/stores/${store.id}`}>
            <StoreCardIcon type="bag" />
            <span>Выбрать магазин</span>
            <StoreCardIcon type="arrow" />
          </Link>
          <Link className="button-link store-details-button" to={`/dashboard/stores/${store.id}/settings`}>
            <StoreCardIcon type="edit" />
            <span>Реквизиты</span>
          </Link>
        </div>
        <div className="store-created-note">
          <StoreCardIcon type="info" />
          <span>{formatStoreDate(store.createdAt)}</span>
        </div>
      </div>
    </article>
  );
}

export function DashboardPage() {
  const { storeId } = useParams();
  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | OwnerProductStatus>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sort, setSort] = useState("new");
  const selectedStore = stores.find((store) => store.id === storeId);
  const publicStoreUrl = selectedStore ? `${location.origin}/m/${selectedStore.slug}` : "";

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
      return;
    }

    let ignore = false;
    api.get<Product[]>(`/owner/stores/${storeId}/products`).then((res) => {
      if (!ignore) setProducts(res.data);
    });
    return () => {
      ignore = true;
    };
  }, [storeId]);

  if (isLoading) return <section className="empty">Загрузка...</section>;

  if (!storeId) {
    return (
      <section>
        <div className="section-head">
          <div>
            <h1>Кабинет владельца</h1>
            <p>Сначала выберите магазин, затем добавляйте товары или меняйте реквизиты.</p>
          </div>
        </div>

        {stores.length ? (
          <div className="store-choice-grid">
            {stores.map((store) => (
              <StoreChoiceCard store={store} key={store.id} />
            ))}
          </div>
        ) : (
          <div className="empty">Для вашего аккаунта еще не создан магазин.</div>
        )}
      </section>
    );
  }

  if (!selectedStore) {
    return (
      <section className="empty">
        <div>
          <p>Магазин не найден или недоступен.</p>
          <Link className="button-link" to="/dashboard">
            Вернуться к выбору магазина
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="owner-products-page">
      <div className="owner-breadcrumbs">
        <Link to="/dashboard" aria-label="К выбору магазина">
          <OwnerIcon type="home" />
        </Link>
        <span>/</span>
        <Link to="/dashboard">Магазины</Link>
        <span>/</span>
        <span>{selectedStore.name}</span>
      </div>

      <div className="owner-store-header">
        <div className="owner-store-summary">
          <div className="owner-store-logo">
            {selectedStore.logoUrl ? <img src={selectedStore.logoUrl} alt="" /> : <StorefrontIcon />}
            <span className={selectedStore.isActive ? "owner-store-status active" : "owner-store-status"}>
              <span />
              {selectedStore.isActive ? "Активен" : "В архиве"}
            </span>
          </div>
          <div className="owner-store-copy">
            <div className="owner-store-title-row">
              <h1>{selectedStore.name}</h1>
              <Link to={`/dashboard/stores/${selectedStore.id}/settings`} aria-label="Редактировать магазин">
                <OwnerIcon type="edit" />
              </Link>
            </div>
            <p>
              Публичная ссылка: <a href={`/m/${selectedStore.slug}`}>{publicStoreUrl}</a>
              <button type="button" onClick={() => navigator.clipboard?.writeText(publicStoreUrl)} aria-label="Скопировать публичную ссылку">
                <OwnerIcon type="copy" />
              </button>
            </p>
          </div>
        </div>
        <div className="owner-store-actions">
          <Link className="button-link" to="/dashboard">
            <OwnerIcon type="swap" />
            Сменить магазин
          </Link>
          <Link className="button-link" to={`/dashboard/stores/${selectedStore.id}/settings`}>
            <OwnerIcon type="edit" />
            Реквизиты магазина
          </Link>
          <Link className="primary button-link" to={`/dashboard/stores/${selectedStore.id}/products/new`}>
            <OwnerIcon type="plus" />
            Добавить товар
          </Link>
        </div>
      </div>

      <div className="tabs">
        <Link to={`/dashboard/stores/${selectedStore.id}/products`}>Товары</Link>
        <Link to={`/dashboard/stores/${selectedStore.id}/settings`}>Настройки магазина</Link>
      </div>

      <div className="owner-products-panel">
        <div className="owner-stat-grid">
          <div className="owner-stat-card total">
            <span><OwnerIcon type="cube" /></span>
            <div><small>Всего товаров</small><strong>{stats.total}</strong></div>
          </div>
          <div className="owner-stat-card published">
            <span><OwnerIcon type="eye" /></span>
            <div><small>Опубликовано</small><strong>{stats.published}</strong></div>
          </div>
          <div className="owner-stat-card draft">
            <span><OwnerIcon type="clock" /></span>
            <div><small>Черновики</small><strong>{stats.draft}</strong></div>
          </div>
          <div className="owner-stat-card archive">
            <span><OwnerIcon type="archive" /></span>
            <div><small>Архив</small><strong>{stats.archive}</strong></div>
          </div>
        </div>

        <div className="owner-product-toolbar">
          <label className="owner-search">
            <OwnerIcon type="search" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск товара..." />
          </label>
          <label>
            <span>Статус:</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | OwnerProductStatus)}>
              <option value="all">Все</option>
              <option value="published">Опубликован</option>
              <option value="draft">Черновик</option>
              <option value="archive">Архив</option>
            </select>
          </label>
          <label>
            <span>Категория:</span>
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              <option value="all">Все</option>
              {categories.map((category) => <option value={category} key={category}>{category}</option>)}
            </select>
          </label>
          <label className="owner-sort">
            <OwnerIcon type="filter" />
            <span>Сортировка:</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="new">Сначала новые</option>
              <option value="old">Сначала старые</option>
              <option value="price-asc">Цена по возрастанию</option>
              <option value="price-desc">Цена по убыванию</option>
            </select>
          </label>
        </div>

        <div className="owner-product-table">
          <div className="owner-product-row owner-product-head">
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
              <div className="owner-product-row" key={product.id}>
                <div className="owner-product-main">
                  <span className="owner-product-thumb"><ProductThumb product={product} /></span>
                  <div>
                    <strong>{product.title}</strong>
                    <small>{productDetails(product)}</small>
                  </div>
                </div>
                <span className={`owner-product-status ${status}`}>{productStatusLabel(status)}</span>
                <span>{productPrice(product)}</span>
                <span>{product.category || "Без категории"}</span>
                <span>{formatProductDate(product.updatedAt ?? product.createdAt)}</span>
                <div className="owner-product-actions">
                  <Link to={`/m/${selectedStore.slug}/p/${product.id}`} aria-label="Открыть товар">
                    <OwnerIcon type="eye" />
                  </Link>
                  <Link to={`/dashboard/stores/${selectedStore.id}/products/${product.id}/edit`} aria-label="Редактировать товар">
                    <OwnerIcon type="edit" />
                  </Link>
                  <button type="button" aria-label="Еще действия">
                    <OwnerIcon type="menu" />
                  </button>
                </div>
              </div>
            );
          })}
          {!filteredProducts.length && <div className="empty">Товары не найдены.</div>}
        </div>

        <div className="owner-product-footer">
          <span>Показано {filteredProducts.length ? `1-${filteredProducts.length}` : "0"} из {products.length}</span>
          <div className="owner-pagination" aria-hidden="true">
            <button type="button">‹</button>
            <button className="active" type="button">1</button>
            <button type="button">2</button>
            <button type="button">3</button>
            <button type="button">›</button>
          </div>
          <select defaultValue="10">
            <option value="10">10 на странице</option>
            <option value="20">20 на странице</option>
          </select>
        </div>
      </div>
    </section>
  );
}
