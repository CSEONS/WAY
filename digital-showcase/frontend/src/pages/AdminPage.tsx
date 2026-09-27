import {
  AiMagicIcon,
  ArrowRight01Icon,
  Call02Icon,
  InboxIcon,
  Invoice01Icon,
  Money03Icon,
  Note01Icon,
  Package01Icon,
  PlusSignIcon,
  Store01Icon,
  UserAccountIcon
} from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { AcceptPaymentModal } from "../components/admin/AcceptPaymentModal";
import { BackupCard } from "../components/admin/BackupCard";
import type { AdminOverview, OverviewStore } from "../types/models";
import { formatLastSeen, formatMoney, formatMonth, plural } from "../utils/format";
import { phoneUrl } from "../utils/contact";
import { subscriptionBadge } from "../utils/subscription";
import { Badge, Button, ButtonLink, Card, CardHeader, ErrorState, Icon, LoadingState, Page, PageHeader, Stat, type IconSvgElement } from "../ui";
import styles from "./AdminPage.module.css";

const sections: { to: string; label: string; icon: IconSvgElement }[] = [
  { to: "/admin/stores", label: "Магазины", icon: Store01Icon },
  { to: "/admin/owners", label: "Владельцы", icon: UserAccountIcon },
  { to: "/admin/payments", label: "Оплаты", icon: Money03Icon },
  { to: "/admin/reports", label: "Отчёты владельцам", icon: Invoice01Icon },
  { to: "/admin/leads", label: "Заявки с сайта", icon: InboxIcon },
  { to: "/admin/journal", label: "Журнал действий", icon: Note01Icon }
];

type PayTarget = Pick<OverviewStore, "id" | "name" | "subscriptionEndsAt" | "subscription">;

/** The admin's first screen: who to call today, money, AI spend, every store at a glance. */
export function AdminPage() {
  const [overview, setOverview] = useState<AdminOverview>();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [payTarget, setPayTarget] = useState<PayTarget | null>(null);

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

  const workingStores = overview.stores.filter((store) => !["expired", "disabled"].includes(store.subscription.state)).length;
  const currentMonth = overview.revenue.byMonth[overview.revenue.byMonth.length - 1];
  const needsAttention = overview.expiring.length + overview.overdue.length + overview.inactive.length > 0;

  return (
    <Page className={styles.page}>
      {header}

      <div className={styles.stats}>
        <Stat icon={Store01Icon} label="Витрин работает" value={`${workingStores} из ${overview.stores.length}`} />
        <Stat icon={Money03Icon} label={`Выручка, ${currentMonth ? formatMonth(currentMonth.month) : "месяц"}`} value={formatMoney(overview.revenue.thisMonth)} />
        <Stat icon={InboxIcon} label="Новых заявок" value={overview.newLeads} />
        <Stat
          icon={AiMagicIcon}
          label="ИИ за месяц"
          value={`${overview.ai.cards} ${plural(overview.ai.cards, ["карточка", "карточки", "карточек"])}${overview.ai.costRub != null ? ` · ≈${formatMoney(overview.ai.costRub)}` : ""}`}
        />
      </div>

      <BackupCard />

      {needsAttention && (
        <Card as="section" padding="lg" className={styles.attention}>
          <CardHeader title="Требуют внимания" description="Кому позвонить сегодня" />
          <AttentionGroup
            title="Подписка скоро закончится"
            stores={overview.expiring}
            onPay={setPayTarget}
          />
          <AttentionGroup title="Подписка закончилась" stores={overview.overdue} onPay={setPayTarget} />
          <AttentionGroup
            title="Давно не заходили в кабинет"
            stores={overview.inactive}
            detail={(store) => `${store.ownerName}: ${formatLastSeen(store.ownerLastSeenAt)}`}
          />
        </Card>
      )}

      <Card as="section" padding="lg">
        <CardHeader title="Все магазины" description="Сначала те, у кого подписка заканчивается раньше" />
        {overview.stores.length ? (
          <div className={styles.storeList}>
            {overview.stores.map((store) => (
              <StoreRow key={store.id} store={store} onPay={() => setPayTarget(store)} />
            ))}
          </div>
        ) : (
          <p className={styles.muted}>Магазинов пока нет — нажмите «Подключить магазин».</p>
        )}
      </Card>

      <Card as="section" padding="lg">
        <CardHeader title="Разделы" />
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
                <Icon icon={ArrowRight01Icon} size="sm" />
              </span>
            </Link>
          ))}
        </nav>
      </Card>

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
                  Принять оплату
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CallButton({ phone }: { phone: string }) {
  return (
    <ButtonLink variant="outline" size="sm" icon={Call02Icon} href={phoneUrl(phone)}>
      {phone}
    </ButtonLink>
  );
}

function StoreRow({ store, onPay }: { store: OverviewStore; onPay: () => void }) {
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
        <span>
          <Icon icon={Package01Icon} size="xs" />
          {store.visibleProductCount} из {store.productCount} на витрине
        </span>
        <span>
          <Icon icon={Call02Icon} size="xs" />
          {store.contactsThisMonth} {plural(store.contactsThisMonth, ["обращение", "обращения", "обращений"])} за месяц
        </span>
        {Boolean(store.aiFormEnabled) && (
          <span className={store.ai.used >= store.ai.limit ? styles.aiOver : undefined}>
            <Icon icon={AiMagicIcon} size="xs" />
            ИИ {store.ai.used} из {store.ai.limit}
          </span>
        )}
      </div>
      <Button variant="secondary" size="sm" icon={Money03Icon} onClick={onPay} className={styles.payButton}>
        Принять оплату
      </Button>
    </div>
  );
}
