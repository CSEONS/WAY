import {
  AiMagicIcon,
  ArrowRight01Icon,
  Call02Icon,
  Cancel01Icon,
  ContactBookIcon,
  DatabaseRestoreIcon,
  HourglassIcon,
  ImageNotFound01Icon,
  InboxIcon,
  Invoice01Icon,
  LegalDocument01Icon,
  Money03Icon,
  Note01Icon,
  Package01Icon,
  PlayCircleIcon,
  PlusSignIcon,
  Settings02Icon,
  ShoppingBasketAdd01Icon,
  Store01Icon,
  StoreRemove01Icon,
  Tag01Icon,
  TaskDone01Icon,
  UserAccountIcon
} from "@hugeicons/core-free-icons";
import { type ReactNode, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { AcceptPaymentModal } from "../components/admin/AcceptPaymentModal";
import { AiProviderCard } from "../components/admin/AiProviderCard";
import { AiSpendTab } from "../components/admin/AiSpendTab";
import { BackupCard } from "../components/admin/BackupCard";
import { SellPackageModal } from "../components/admin/SellPackageModal";
import { packageSummary } from "../components/landing/PackageCard";
import { useSiteSettings } from "../state/siteSettings";
import type { AdminOverview, Lead, OpenPackageOrder, OverviewStore } from "../types/models";
import { formatDate, formatLastSeen, formatMoney, plural } from "../utils/format";
import { phoneUrl } from "../utils/contact";
import { subscriptionBadge } from "../utils/subscription";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  ErrorState,
  Icon,
  LoadingState,
  Notice,
  Page,
  PageHeader,
  SegmentedControl,
  Stat,
  useToast,
  type IconSvgElement
} from "../ui";
import styles from "./AdminPage.module.css";

const sections: { to: string; label: string; icon: IconSvgElement }[] = [
  { to: "/admin/stores", label: "Магазины", icon: Store01Icon },
  { to: "/admin/owners", label: "Владельцы", icon: UserAccountIcon },
  { to: "/admin/payments", label: "Оплаты", icon: Money03Icon },
  { to: "/admin/reports", label: "Отчёты владельцам", icon: Invoice01Icon },
  { to: "/admin/leads", label: "Заявки с сайта", icon: InboxIcon },
  { to: "/admin/journal", label: "Журнал действий", icon: Note01Icon },
  { to: "/admin/moderation", label: "Проверка фото", icon: ImageNotFound01Icon },
  { to: "/admin/plans", label: "Тарифы, пакеты и цены", icon: Tag01Icon },
  { to: "/admin/contacts", label: "Контакты", icon: ContactBookIcon },
  { to: "/admin/videos", label: "Видеоинструкции", icon: PlayCircleIcon },
  { to: "/admin/legal", label: "Реквизиты", icon: LegalDocument01Icon },
  { to: "/admin/settings", label: "Настройки ИИ", icon: Settings02Icon }
];

type PayTarget = Pick<OverviewStore, "id" | "name" | "subscriptionEndsAt" | "subscription" | "planId">;

/** «Продать пакет»: a store (with what packages left it), and the owner's request when it's paid from one. */
type SellTarget = { store: { id: string; name: string; extraPreviews?: number; extraFills?: number }; order?: OpenPackageOrder };

type Tab = "overview" | "stores" | "ai" | "system" | "sections";

const tabs: { value: Tab; label: string }[] = [
  { value: "overview", label: "Обзор" },
  { value: "stores", label: "Магазины" },
  { value: "ai", label: "Расходы на ИИ" },
  { value: "system", label: "Система" },
  { value: "sections", label: "Разделы" }
];

/**
 * The admin's first screen. On top — only what needs doing now: unpaid and
 * ending subscriptions, new requests, a failed backup, data due for deletion.
 * Everything else sits in tabs; the open tab is kept in the address (?tab=).
 */
export function AdminPage() {
  const [params, setParams] = useSearchParams();
  const tab = tabs.find((item) => item.value === params.get("tab"))?.value ?? "overview";
  const [overview, setOverview] = useState<AdminOverview>();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [payTarget, setPayTarget] = useState<PayTarget | null>(null);
  const [sellTarget, setSellTarget] = useState<SellTarget | null>(null);
  const toast = useToast();
  // The privacy policy promises to delete a store's data this long after the paid date (admin panel → «Реквизиты»).
  const keepDataDays = useSiteSettings()?.legal.keepDataDays ?? 90;

  function load() {
    api
      .get<AdminOverview>("/admin/overview")
      .then((res) => {
        setOverview(res.data);
        setState("ready");
      })
      .catch(() => setState("error"));
  }

  useEffect(load, []);

  /** «Отклонить» a request or «Выполнено» for a paid service. */
  async function closeOrder(order: OpenPackageOrder, action: "decline" | "done") {
    try {
      await api.post(`/admin/package-orders/${order.id}/${action}`);
      toast.show(action === "done" ? `«${order.name}» для «${order.storeName}» — выполнено` : `Запрос «${order.name}» отклонён`, { tone: "success" });
      load();
    } catch (err: any) {
      toast.show(err?.response?.data?.message ?? "Не получилось", { tone: "danger" });
    }
  }

  /** Sell from a request: the store's balance comes from the overview row. */
  function sellFromRequest(order: OpenPackageOrder) {
    const store = overview?.stores.find((item) => item.id === order.storeId);
    setSellTarget({ store: { id: order.storeId, name: order.storeName, ...store?.ai }, order });
  }

  function openTab(value: Tab) {
    setParams(value === "overview" ? {} : { tab: value }, { replace: true });
  }

  const header = (
    <PageHeader
      title="Админ-панель"
      actions={
        <ButtonLink variant="primary" icon={PlusSignIcon} to="/admin/connect">
          Подключить магазин
        </ButtonLink>
      }
    />
  );

  if (state === "error") {
    return (
      <Page>
        {header}
        <ErrorState onRetry={load} />
      </Page>
    );
  }
  if (!overview) {
    return (
      <Page>
        {header}
        <LoadingState />
      </Page>
    );
  }

  // Paid and open — «Работает»; unpaid, but buyers still see it for the grace days — «Ждут оплаты»
  // (no new products until paid); unpaid and closed to buyers — «Просрочено».
  const working = overview.stores.filter((store) => ["active", "expiring", "unlimited"].includes(store.subscription.state));
  const awaitingPayment = overview.overdue.filter((store) => store.subscription.state === "grace");
  const deleteAfter = Date.now() - keepDataDays * 24 * 60 * 60 * 1000;
  const dataToDelete = overview.overdue.filter((store) => store.subscription.endsAt && Date.parse(store.subscription.endsAt) < deleteAfter);
  const pastDue = overview.overdue.filter((store) => store.subscription.state === "expired");
  const pastDueToCall = pastDue.filter((store) => !dataToDelete.includes(store));
  const urgentCount =
    awaitingPayment.length +
    pastDueToCall.length +
    overview.latestLeads.length +
    overview.expiring.length +
    dataToDelete.length +
    overview.packageRequests.length +
    overview.packageServices.length +
    (overview.backupProblem ? 1 : 0) +
    (overview.moderationPending ? 1 : 0);

  return (
    <Page className={styles.page}>
      {header}

      {urgentCount > 0 ? (
        <Card as="section" padding="lg" className={styles.attention}>
          <CardHeader title="Нужно сделать сейчас" description="Оплаты, заявки и всё, что не может ждать" />
          {overview.backupProblem && <BackupAlert problem={overview.backupProblem} onOpen={() => openTab("system")} />}
          <AttentionGroup title="Ждут оплаты — витрина ещё видна покупателям" stores={awaitingPayment} onPay={setPayTarget} />
          <AttentionGroup title="Просрочено — витрина закрыта" stores={pastDueToCall} onPay={setPayTarget} />
          <LeadGroup leads={overview.latestLeads} total={overview.newLeads} />
          <PackageGroup
            title="Просят пакет — примите оплату"
            orders={overview.packageRequests}
            actions={(order) => (
              <>
                <Button variant="secondary" size="sm" icon={ShoppingBasketAdd01Icon} onClick={() => sellFromRequest(order)}>
                  Оплачено
                </Button>
                <Button variant="ghost" size="sm" icon={Cancel01Icon} onClick={() => closeOrder(order, "decline")}>
                  Отклонить
                </Button>
              </>
            )}
          />
          <PackageGroup
            title="Оплачено — сделайте услугу"
            orders={overview.packageServices}
            actions={(order) => (
              <Button variant="secondary" size="sm" icon={TaskDone01Icon} onClick={() => closeOrder(order, "done")}>
                Выполнено
              </Button>
            )}
          />
          {overview.moderationPending > 0 && (
            <Notice
              tone="warning"
              title={`Фото на проверке: ${overview.moderationPending}`}
              action={
                <ButtonLink variant="secondary" size="sm" icon={ImageNotFound01Icon} to="/admin/moderation">
                  Проверить
                </ButtonLink>
              }
            >
              ИИ нашёл на них людей или животных. Покупатели их не видят, пока вы не решите.
            </Notice>
          )}
          <AttentionGroup title="Подписка скоро закончится" stores={overview.expiring} onPay={setPayTarget} />
          <AttentionGroup
            title={`Пора удалить данные: не платят больше ${keepDataDays} дней`}
            stores={dataToDelete}
            detail={(store) => `${store.ownerName} — так обещано в политике конфиденциальности. Удаление: «Магазины» → «Удалить».`}
          />
        </Card>
      ) : (
        <Notice tone="success" title="Срочных дел нет">
          Новых заявок нет, подписки оплачены, резервные копии в порядке.
        </Notice>
      )}

      <SegmentedControl label="Разделы админ-панели" value={tab} onChange={openTab} options={tabs} className={styles.tabs} />

      {tab === "overview" && (
        <div className={styles.stats}>
          <Stat icon={InboxIcon} label="Новые заявки" value={overview.newLeads} hint="С лендинга, ещё не обработаны" />
          <Stat icon={Store01Icon} label="Работает" value={working.length} hint="Оплачены, витрина открыта" />
          <Stat icon={HourglassIcon} label="Ждут оплаты" value={awaitingPayment.length} hint="Покупатели видят витрину, новые товары добавить нельзя" />
          <Stat icon={StoreRemove01Icon} label="Просрочено" value={pastDue.length} hint="Не оплачены, витрина закрыта для покупателей" />
        </div>
      )}

      {tab === "stores" && (
        <>
          {overview.inactive.length > 0 && (
            <Card as="section" padding="lg" className={styles.section}>
              <CardHeader title="Давно не заходили в кабинет" description="Позвоните: возможно, нужна помощь с товарами" />
              <AttentionGroup title="Владельцы" stores={overview.inactive} detail={(store) => `${store.ownerName}: ${formatLastSeen(store.ownerLastSeenAt)}`} />
            </Card>
          )}
          <Card as="section" padding="lg">
            <CardHeader title="Все магазины" description="Сначала те, у кого подписка заканчивается раньше" />
            {overview.stores.length ? (
              <div className={styles.storeList}>
                {overview.stores.map((store) => (
                  <StoreRow
                    key={store.id}
                    store={store}
                    onPay={() => setPayTarget(store)}
                    onSell={() => setSellTarget({ store: { id: store.id, name: store.name, ...store.ai } })}
                  />
                ))}
              </div>
            ) : (
              <p className={styles.muted}>Магазинов пока нет — нажмите «Подключить магазин».</p>
            )}
          </Card>
        </>
      )}

      {tab === "ai" && <AiSpendTab summary={overview.ai} />}

      {tab === "system" && (
        <>
          <BackupCard />
          <AiProviderCard />
        </>
      )}

      {tab === "sections" && (
        <Card as="section" padding="lg">
          <nav className={styles.tiles} aria-label="Разделы админки">
            {sections.map((section) => (
              <Link key={section.to} to={section.to} className={styles.tile}>
                <span className={styles.tileLabel}>
                  <Icon icon={section.icon} size="md" />
                  {section.label}
                </span>
                <span className={styles.tileLabel}>
                  {section.to === "/admin/leads" && overview.newLeads > 0 && (
                    <Badge tone="accent">{`${overview.newLeads} ${plural(overview.newLeads, ["новая", "новые", "новых"])}`}</Badge>
                  )}
                  {section.to === "/admin/moderation" && overview.moderationPending > 0 && <Badge tone="warning">{overview.moderationPending}</Badge>}
                  <Icon icon={ArrowRight01Icon} size="sm" />
                </span>
              </Link>
            ))}
          </nav>
        </Card>
      )}

      {sellTarget && (
        <SellPackageModal
          store={sellTarget.store}
          order={sellTarget.order}
          onClose={() => setSellTarget(null)}
          onSold={() => {
            setSellTarget(null);
            load();
          }}
        />
      )}

      {payTarget && (
        <AcceptPaymentModal
          store={payTarget}
          onClose={() => setPayTarget(null)}
          onPaid={() => {
            setPayTarget(null);
            load();
          }}
        />
      )}
    </Page>
  );
}

function AttentionGroup({
  title,
  stores,
  onPay,
  detail
}: {
  title: string;
  stores: OverviewStore[];
  onPay?: (store: OverviewStore) => void;
  detail?: (store: OverviewStore) => string;
}) {
  if (!stores.length) return null;
  return (
    <div className={styles.group}>
      <h3 className={styles.groupTitle}>
        {title} <span className={styles.groupCount}>{stores.length}</span>
      </h3>
      {stores.map((store) => {
        const badge = subscriptionBadge(store.subscription);
        return (
          <div key={store.id} className={styles.attentionRow}>
            <div className={styles.rowText}>
              <strong>{store.name}</strong>
              <small>{detail ? detail(store) : store.ownerName}</small>
            </div>
            {!detail && <Badge tone={badge.tone}>{badge.label}</Badge>}
            <div className={styles.rowActions}>
              {store.ownerPhone && <CallButton phone={store.ownerPhone} />}
              {onPay && (
                <Button variant="secondary" size="sm" icon={Money03Icon} onClick={() => onPay(store)}>
                  Продлить
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** New requests from the landing: call, then connect the store from the request. */
function LeadGroup({ leads, total }: { leads: Lead[]; total: number }) {
  if (!leads.length) return null;
  return (
    <div className={styles.group}>
      <h3 className={styles.groupTitle}>
        Новые заявки <span className={styles.groupCount}>{total}</span>
        {total > leads.length && (
          <Link to="/admin/leads" className={styles.groupLink}>
            Все заявки
          </Link>
        )}
      </h3>
      {leads.map((lead) => (
        <div key={lead.id} className={styles.attentionRow}>
          <div className={styles.rowText}>
            <strong>
              {lead.name}
              {lead.storeName ? ` · ${lead.storeName}` : ""}
            </strong>
            <small>{[lead.city, formatDate(lead.createdAt), lead.comment].filter(Boolean).join(" · ")}</small>
          </div>
          <div className={styles.rowActions}>
            <CallButton phone={lead.phone} />
            <ButtonLink variant="secondary" size="sm" icon={PlusSignIcon} to={`/admin/connect?lead=${lead.id}`}>
              Подключить
            </ButtonLink>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Package requests to take money for, or paid services to do: who, what, and the buttons for it. */
function PackageGroup({ title, orders, actions }: { title: string; orders: OpenPackageOrder[]; actions: (order: OpenPackageOrder) => ReactNode }) {
  if (!orders.length) return null;
  return (
    <div className={styles.group}>
      <h3 className={styles.groupTitle}>
        {title} <span className={styles.groupCount}>{orders.length}</span>
      </h3>
      {orders.map((order) => (
        <div key={order.id} className={styles.attentionRow}>
          <div className={styles.rowText}>
            <strong>
              {order.storeName} · «{order.name}»
            </strong>
            <small>{[order.ownerName, formatMoney(order.price), packageSummary(order), formatDate(order.paidAt ?? order.createdAt)].filter(Boolean).join(" · ")}</small>
          </div>
          <div className={styles.rowActions}>
            {order.ownerPhone && <CallButton phone={order.ownerPhone} />}
            {actions(order)}
          </div>
        </div>
      ))}
    </div>
  );
}

/** A failed copy, or none for a day: the data are at risk until a copy works. */
function BackupAlert({ problem, onOpen }: { problem: NonNullable<AdminOverview["backupProblem"]>; onOpen: () => void }) {
  const action = (
    <Button variant="secondary" size="sm" icon={DatabaseRestoreIcon} onClick={onOpen}>
      К копиям
    </Button>
  );
  if (problem.kind === "failed") {
    return (
      <Notice tone="danger" title="Резервная копия не получилась" action={action}>
        {problem.error ?? "Причина неизвестна"}. Пока копия не сделана, данные не защищены.
      </Notice>
    );
  }
  return (
    <Notice tone="warning" title={problem.at ? "Резервной копии больше суток" : "Резервных копий ещё нет"} action={action}>
      {problem.at ? `Последняя — ${formatDate(problem.at)}. ` : ""}Проверьте, что сервер работает, и сделайте копию вручную.
    </Notice>
  );
}

function CallButton({ phone }: { phone: string }) {
  return (
    <ButtonLink variant="outline" size="sm" icon={Call02Icon} href={phoneUrl(phone)}>
      {phone}
    </ButtonLink>
  );
}

function StoreRow({ store, onPay, onSell }: { store: OverviewStore; onPay: () => void; onSell: () => void }) {
  const extra = [store.ai.extraFills ? `+${store.ai.extraFills} карточек` : "", store.ai.extraPreviews ? `+${store.ai.extraPreviews} превью` : ""].filter(Boolean).join(", ");
  const badge = subscriptionBadge(store.subscription);
  return (
    <div className={styles.storeRow}>
      <div className={styles.rowText}>
        <strong>
          <a href={`/m/${store.slug}`} target="_blank" rel="noreferrer">
            {store.name}
          </a>
        </strong>
        <small>
          {store.ownerName} · {formatLastSeen(store.ownerLastSeenAt)}
        </small>
      </div>
      <div className={styles.storeFacts}>
        <Badge tone={badge.tone}>{badge.label}</Badge>
        {store.planName && <Badge tone={store.aiFormEnabled ? "accent" : "neutral"}>{store.planName}</Badge>}
        <span>
          <Icon icon={Package01Icon} size="xs" />
          {store.visibleProductCount} из {store.productCount} на витрине
        </span>
        <span>
          <Icon icon={Call02Icon} size="xs" />
          {store.contactsThisMonth} {plural(store.contactsThisMonth, ["обращение", "обращения", "обращений"])} за месяц
        </span>
        {(Boolean(store.aiFormEnabled) || extra) && (
          <span className={store.ai.used >= store.ai.limit && !extra ? styles.aiOver : undefined}>
            <Icon icon={AiMagicIcon} size="xs" />
            ИИ {store.ai.used} из {store.ai.limit}
            {extra && ` · из пакетов ${extra}`}
          </span>
        )}
      </div>
      <div className={styles.payButton}>
        <Button variant="secondary" size="sm" icon={Money03Icon} onClick={onPay}>
          Продлить
        </Button>
        <Button variant="ghost" size="sm" icon={ShoppingBasketAdd01Icon} onClick={onSell}>
          Пакет
        </Button>
      </div>
    </div>
  );
}
