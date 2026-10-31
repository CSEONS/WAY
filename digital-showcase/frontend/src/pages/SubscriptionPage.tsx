import { AiMagicIcon, Call02Icon, Calendar03Icon, CreditCardIcon, TelegramIcon, WhatsappIcon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { PackageCard } from "../components/landing/PackageCard";
import type { OnlinePaymentCheck, OwnerSubscription, PackageOrder, PackageOrderStatus, Store } from "../types/models";
import { phoneUrl, telegramUrl, whatsappUrl } from "../utils/contact";
import { formatDate, formatMoney, formatMonth, plural } from "../utils/format";
import { subscriptionNotice } from "../utils/subscription";
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
  ProgressBar,
  SegmentedControl,
  useToast,
  type Tone
} from "../ui";
import { ReceiptLink } from "../components/ReceiptLink";
import styles from "./SubscriptionPage.module.css";

type OwnerOrder = OwnerSubscription["orders"][number];

const orderStatuses: Record<PackageOrderStatus, { label: string; tone: Tone }> = {
  REQUESTED: { label: "Запрошен — администратор свяжется", tone: "accent" },
  PAID: { label: "Оплачен — выполняем", tone: "warning" },
  DONE: { label: "Готово", tone: "success" },
  DECLINED: { label: "Отклонён", tone: "neutral" },
  CANCELLED: { label: "Отменён", tone: "neutral" }
};

/** Asks again while ЮKassa hasn't answered yet: right after the redirect back it can take a few seconds. */
const CHECK_ATTEMPTS = 5;
const CHECK_PAUSE_MS = 2000;

/**
 * «Оплачено до 12 октября», paying online or the admin's contacts, the AI
 * left this month and from packages, packages to ask for, results of the
 * last months and payments — for the owner.
 */
export function SubscriptionPage() {
  const { storeId = "" } = useParams();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  // ЮKassa sends the owner back here with ?payment=<id>; read once, then the address is cleaned.
  const [returnedPayment] = useState(() => searchParams.get("payment"));
  const [checking, setChecking] = useState<"checking" | "waiting" | null>(returnedPayment ? "checking" : null);
  const [months, setMonths] = useState(1);
  const [paying, setPaying] = useState(false);
  // The package being asked for or withdrawn right now.
  const [busyId, setBusyId] = useState<string | null>(null);
  const [store, setStore] = useState<Store>();
  const [data, setData] = useState<OwnerSubscription>();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  function load() {
    setState("loading");
    Promise.all([api.get<Store>(`/owner/stores/${storeId}`), api.get<OwnerSubscription>(`/owner/stores/${storeId}/subscription`)])
      .then(([storeRes, subscriptionRes]) => {
        setStore(storeRes.data);
        setData(subscriptionRes.data);
        setState("ready");
      })
      .catch(() => setState("error"));
  }

  useEffect(load, [storeId]);

  // Back from ЮKassa: paid — the date is new; cancelled — nothing was taken; no answer yet — it comes later.
  useEffect(() => {
    if (!returnedPayment) return;
    setSearchParams({}, { replace: true });
    let cancelled = false;
    void (async () => {
      for (let attempt = 0; attempt < CHECK_ATTEMPTS; attempt++) {
        try {
          const { data: result } = await api.post<OnlinePaymentCheck>(`/owner/stores/${storeId}/online-payments/${returnedPayment}/check`);
          if (cancelled) return;
          if (result.status === "SUCCEEDED") {
            setChecking(null);
            toast.show(`Оплата прошла — подписка продлена до ${formatDate(result.subscription.endsAt)}`, { tone: "success" });
            load();
            return;
          }
          if (result.status === "CANCELED") {
            setChecking(null);
            toast.show("Оплата не прошла, деньги не списаны. Можно попробовать ещё раз", { tone: "danger" });
            return;
          }
        } catch {
          // Asked again below.
        }
        await new Promise((resolve) => setTimeout(resolve, CHECK_PAUSE_MS));
        if (cancelled) return;
      }
      setChecking("waiting");
    })();
    return () => {
      cancelled = true;
    };
  }, [returnedPayment, storeId]);

  /** «Оплатить»: to ЮKassa's page; it sends the owner back here. */
  async function payOnline() {
    setPaying(true);
    try {
      const { data: started } = await api.post<{ id: string; confirmationUrl: string }>(`/owner/stores/${storeId}/online-payments`, { months });
      window.location.assign(started.confirmationUrl);
    } catch (err: any) {
      toast.show(err?.response?.data?.message ?? "Не удалось перейти к оплате", { tone: "danger" });
      setPaying(false);
    }
  }

  function setOrders(update: (orders: OwnerOrder[]) => OwnerOrder[]) {
    setData((current) => current && { ...current, orders: update(current.orders) });
  }

  /** «Запросить»: the admin sees the request at the top of the admin panel and takes the money. */
  async function requestPackage(packageId: string) {
    setBusyId(packageId);
    try {
      const { data: order } = await api.post<PackageOrder>(`/owner/stores/${storeId}/packages/${packageId}/request`);
      setOrders((orders) => [order, ...orders]);
      toast.show("Запрос отправлен — администратор свяжется с вами", { tone: "success" });
    } catch (err: any) {
      toast.show(err?.response?.data?.message ?? "Не удалось отправить запрос", { tone: "danger" });
    } finally {
      setBusyId(null);
    }
  }

  async function withdraw(order: OwnerOrder) {
    setBusyId(order.id);
    try {
      await api.delete(`/owner/stores/${storeId}/package-orders/${order.id}`);
      setOrders((orders) => orders.map((item) => (item.id === order.id ? { ...item, status: "CANCELLED" } : item)));
      toast.show("Запрос отменён");
    } catch (err: any) {
      toast.show(err?.response?.data?.message ?? "Не удалось отменить запрос", { tone: "danger" });
    } finally {
      setBusyId(null);
    }
  }

  const back = { to: `/dashboard/stores/${storeId}`, label: "В кабинет" };
  if (state === "error") {
    return (
      <Page width="narrow">
        <PageHeader title="Подписка и оплата" back={back} />
        <ErrorState onRetry={load} />
      </Page>
    );
  }
  if (!store || !data) {
    return (
      <Page width="narrow">
        <PageHeader title="Подписка и оплата" back={back} />
        <LoadingState />
      </Page>
    );
  }

  const { subscription, online, ai, payments, reports, support, packages, orders } = data;
  const extra = [
    ai.extraFills ? `${ai.extraFills} ${plural(ai.extraFills, ["карточка", "карточки", "карточек"])}` : "",
    ai.extraPreviews ? `${ai.extraPreviews} превью` : ""
  ]
    .filter(Boolean)
    .join(" и ");
  const requested = new Set(orders.filter((order) => order.status === "REQUESTED").map((order) => order.packageId));
  const notice = subscriptionNotice(subscription);
  const isTrial = payments.length === 0 && Boolean(subscription.endsAt);
  const renewText = `Здравствуйте! Хочу продлить подписку витрины «${store.name}».`;
  const hasSupport = Boolean(support.whatsapp || support.phone || support.telegram);
  // A new period goes on top of the old one while the storefront still works (grace days included), otherwise from today.
  const paidOnTop = Boolean(subscription.endsAt) && ["active", "expiring", "grace"].includes(subscription.state);
  const onlineTotal = online ? Math.round(online.price * months) : 0;

  return (
    <Page width="narrow">
      <PageHeader title="Подписка и оплата" description={store.name} back={back} />

      {checking === "checking" && (
        <Notice tone="accent" title="Проверяем оплату…">
          Это займёт несколько секунд.
        </Notice>
      )}
      {checking === "waiting" && (
        <Notice tone="warning" title="Ждём подтверждения от ЮKassa">
          Если деньги списались, подписка продлится сама, обычно в течение нескольких минут — обновите страницу позже. Если этого не случилось, напишите
          администратору.
        </Notice>
      )}

      {notice && (
        <Notice tone={notice.tone} title={notice.title}>
          {notice.text}
        </Notice>
      )}

      <Card as="section" padding="lg" className={styles.card}>
        <div className={styles.status}>
          <span className={styles.statusIcon}>
            <Icon icon={Calendar03Icon} size="md" />
          </span>
          <div>
            <span className={styles.statusLabel}>{isTrial ? "Пробный период" : "Подписка"}</span>
            <strong className={styles.statusValue}>
              {subscription.state === "unlimited"
                ? "Без даты окончания"
                : subscription.state === "expired"
                  ? `Закончилась ${formatDate(subscription.endsAt)}`
                  : `${subscription.state === "grace" ? "Была оплачена" : isTrial ? "До" : "Оплачено до"} ${formatDate(subscription.endsAt)}`}
            </strong>
          </div>
          {data.plan && (
            <Badge tone={data.plan.aiEnabled ? "accent" : "neutral"} className={styles.plan}>
              {data.plan.name}
            </Badge>
          )}
        </div>
        <p className={styles.muted}>
          После окончания витрина работает ещё {data.graceDays} дня, чтобы вы успели продлить, но новые товары в эти дни добавить нельзя.{" "}
          {online ? "Продлить можно онлайн или у администратора." : "Продление — у администратора, оплата наличными или переводом."}
        </p>
        {online && (
          <div className={styles.online}>
            <SegmentedControl
              className={styles.period}
              label="Срок оплаты"
              value={String(months)}
              onChange={(value) => setMonths(Number(value))}
              options={online.months.map((count) => ({ value: String(count), label: `${count} мес.` }))}
            />
            <div className={styles.onlineTotal}>
              <strong>{formatMoney(onlineTotal)}</strong>
              <small>
                {formatMoney(online.price)} в месяц · тариф «{online.planName}»
              </small>
            </div>
            <Button variant="primary" icon={CreditCardIcon} loading={paying} disabled={checking === "checking"} onClick={() => void payOnline()}>
              Оплатить {formatMoney(onlineTotal)}
            </Button>
            <small>
              {paidOnTop ? `Срок добавится к ${formatDate(subscription.endsAt)}. ` : "Срок начнётся сегодня. "}
              Оплата картой или через СБП на странице ЮKassa. Подписка продлится сразу после оплаты.
            </small>
          </div>
        )}
        {hasSupport ? (
          <div className={styles.actions}>
            {support.whatsapp && (
              <ButtonLink
                variant={online ? "outline" : "primary"}
                icon={WhatsappIcon}
                href={whatsappUrl(support.whatsapp, renewText)}
                target="_blank"
                rel="noreferrer"
              >
                Написать администратору
              </ButtonLink>
            )}
            {support.telegram && (
              <ButtonLink variant="outline" icon={TelegramIcon} href={telegramUrl(support.telegram)} target="_blank" rel="noreferrer">
                Telegram
              </ButtonLink>
            )}
            {support.phone && (
              <ButtonLink variant="outline" icon={Call02Icon} href={phoneUrl(support.phone)}>
                {support.phone}
              </ButtonLink>
            )}
          </div>
        ) : (
          !online && <p className={styles.muted}>Чтобы продлить, свяжитесь с администратором, который подключал вам витрину.</p>
        )}
      </Card>

      <Card as="section" padding="lg" className={styles.card}>
        <CardHeader title="ИИ-помощник" />
        {ai.enabled ? (
          <>
            {ai.limit > 0 && (
              <>
                <ProgressBar value={(ai.used / ai.limit) * 100} label="Использовано карточек ИИ" />
                <p className={styles.aiText}>
                  <Icon icon={AiMagicIcon} size="sm" />
                  {ai.used >= ai.limit
                    ? `В этом месяце карточки ИИ по тарифу закончились (${ai.limit}).${extra ? "" : " Товары можно добавлять вручную, лимит обновится 1-го числа."}`
                    : `Использовано ${ai.used} из ${ai.limit} карточек в этом месяце. Осталось ${ai.limit - ai.used}.`}
                </p>
              </>
            )}
            {extra && (
              <p className={styles.aiText}>
                <Icon icon={AiMagicIcon} size="sm" />
                Из пакетов осталось: {extra}. Они тратятся, когда закончится месячный лимит тарифа, и не сгорают.
              </p>
            )}
          </>
        ) : (
          <p className={styles.muted}>
            ИИ заполняет карточку по фото и голосу: название, описание, размеры и цвета. Доступен в тарифах с ИИ-помощником — спросите у администратора.
          </p>
        )}
      </Card>

      {(packages.length > 0 || orders.length > 0) && (
        <Card as="section" padding="lg" className={styles.card}>
          <CardHeader title="Пакеты" description="Докупаются разово к любому тарифу. Запросите — администратор свяжется и примет оплату" />
          {packages.length > 0 && (
            <div className={styles.packages}>
              {packages.map((item) => (
                <PackageCard
                  key={item.id}
                  item={item}
                  action={
                    requested.has(item.id) ? (
                      <Button variant="secondary" block disabled>
                        Запрос отправлен
                      </Button>
                    ) : (
                      <Button variant="primary" block loading={busyId === item.id} onClick={() => void requestPackage(item.id)}>
                        Запросить
                      </Button>
                    )
                  }
                />
              ))}
            </div>
          )}
          {orders.length > 0 && (
            <div className={styles.orders}>
              <span className={styles.ordersTitle}>Ваши запросы и покупки</span>
              {orders.map((order) => (
                <div key={order.id} className={styles.order}>
                  <div className={styles.orderText}>
                    <strong>{order.name}</strong>
                    <small>
                      {formatDate(order.paidAt ?? order.createdAt)} · {order.price ? formatMoney(order.price) : "Бесплатно"}
                    </small>
                  </div>
                  <Badge tone={orderStatuses[order.status].tone}>{orderStatuses[order.status].label}</Badge>
                  {order.status === "REQUESTED" && (
                    <Button variant="ghost" size="sm" loading={busyId === order.id} onClick={() => void withdraw(order)}>
                      Отменить запрос
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {!data.reportsAnytime ? (
        <Notice tone="accent" title="Итоги месяца — в уведомлениях">
          В начале каждого месяца в колокольчик приходят итоги прошлого: сколько раз открыли витрину и товары, сколько человек написали или позвонили.
          Смотреть итоги в любой день можно в полной версии — спросите администратора.
        </Notice>
      ) : (
      <Card as="section" padding="lg" className={styles.card}>
        <CardHeader title="Итоги по месяцам" description="Сколько людей смотрели витрину и связались с вами" />
        <div className={styles.reports}>
          {reports.map((report, index) => (
            <div key={report.month} className={styles.report}>
              <strong className={styles.reportMonth}>
                {formatMonth(report.month)}
                {index === 0 && <small> · пока идёт</small>}
              </strong>
              <div className={styles.reportNumbers}>
                <span>
                  <b>{report.storeViews}</b> просмотров витрины
                </span>
                <span>
                  <b>{report.productViews}</b> просмотров товаров
                </span>
                <span>
                  <b>{report.contactClicks}</b> написали или позвонили
                </span>
              </div>
              {report.topProducts.length > 0 && <small className={styles.muted}>Чаще смотрели: {report.topProducts.map((product) => product.title).join(", ")}</small>}
              {report.storeViews === 0 && index > 0 && (
                <small className={styles.muted}>Витрину не открывали. Отправьте ссылку в статус WhatsApp и повесьте QR-плакат на кассе.</small>
              )}
            </div>
          ))}
        </div>
      </Card>
      )}

      <Card as="section" padding="lg" className={styles.card}>
        <CardHeader title="История оплат" />
        {payments.length ? (
          <div className={styles.payments}>
            {payments.map((payment) => (
              <div key={payment.id} className={styles.payment}>
                <span>{formatDate(payment.createdAt)}</span>
                <strong>{payment.amount ? formatMoney(payment.amount) : "Бесплатно"}</strong>
                <small>
                  {payment.packageName ? `Пакет «${payment.packageName}»` : `${payment.months} мес., до ${formatDate(payment.periodEnd)}`}
                  {payment.receipt && (
                    <>
                      {" · "}
                      <ReceiptLink receipt={payment.receipt} />
                    </>
                  )}
                </small>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.muted}>Оплат пока не было.</p>
        )}
      </Card>
    </Page>
  );
}
