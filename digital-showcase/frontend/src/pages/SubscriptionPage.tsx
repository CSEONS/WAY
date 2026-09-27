import { AiMagicIcon, Call02Icon, Calendar03Icon, TelegramIcon, WhatsappIcon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client";
import type { OwnerSubscription, Store } from "../types/models";
import { phoneUrl, telegramUrl, whatsappUrl } from "../utils/contact";
import { formatDate, formatMoney, formatMonth } from "../utils/format";
import { subscriptionNotice } from "../utils/subscription";
import { Badge, ButtonLink, Card, CardHeader, ErrorState, Icon, LoadingState, Notice, Page, PageHeader, ProgressBar } from "../ui";
import styles from "./SubscriptionPage.module.css";

/** «Оплачено до 12 октября», the AI left this month, results of the last months and payments — for the owner. */
export function SubscriptionPage() {
  const { storeId = "" } = useParams();
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

  const back = { to: `/dashboard/stores/${storeId}`, label: "В кабинет" };
  if (state === "error") {
    return (
      <Page width="narrow">
        <PageHeader title="Подписка и итоги" back={back} />
        <ErrorState onRetry={load} />
      </Page>
    );
  }
  if (!store || !data) {
    return (
      <Page width="narrow">
        <PageHeader title="Подписка и итоги" back={back} />
        <LoadingState />
      </Page>
    );
  }

  const { subscription, ai, payments, reports, support } = data;
  const notice = subscriptionNotice(subscription);
  const isTrial = payments.length === 0 && Boolean(subscription.endsAt);
  const renewText = `Здравствуйте! Хочу продлить подписку витрины «${store.name}».`;
  const hasSupport = Boolean(support.whatsapp || support.phone || support.telegram);

  return (
    <Page width="narrow">
      <PageHeader title="Подписка и итоги" description={store.name} back={back} />

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
          <Badge tone={store.aiFormEnabled ? "accent" : "neutral"} className={styles.plan}>
            {store.aiFormEnabled ? "Витрина + ИИ" : "Витрина"}
          </Badge>
        </div>
        <p className={styles.muted}>
          После окончания витрина работает ещё {data.graceDays} дня, чтобы вы успели продлить. Продление — у администратора, оплата наличными или переводом.
        </p>
        {hasSupport ? (
          <div className={styles.actions}>
            {support.whatsapp && (
              <ButtonLink variant="primary" icon={WhatsappIcon} href={whatsappUrl(support.whatsapp, renewText)} target="_blank" rel="noreferrer">
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
          <p className={styles.muted}>Чтобы продлить, свяжитесь с администратором, который подключал вам витрину.</p>
        )}
      </Card>

      <Card as="section" padding="lg" className={styles.card}>
        <CardHeader title="ИИ-помощник" />
        {ai.enabled ? (
          <>
            <ProgressBar value={ai.limit ? (ai.used / ai.limit) * 100 : 100} label="Использовано карточек ИИ" />
            <p className={styles.aiText}>
              <Icon icon={AiMagicIcon} size="sm" />
              {ai.used >= ai.limit
                ? `В этом месяце карточки ИИ закончились (${ai.limit}). Товары можно добавлять вручную, лимит обновится 1-го числа.`
                : `Использовано ${ai.used} из ${ai.limit} карточек в этом месяце. Осталось ${ai.limit - ai.used}.`}
            </p>
          </>
        ) : (
          <p className={styles.muted}>
            ИИ заполняет карточку по фото и голосу: название, описание, размеры и цвета. Доступен в тарифе «Витрина + ИИ» — спросите у администратора.
          </p>
        )}
      </Card>

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

      <Card as="section" padding="lg" className={styles.card}>
        <CardHeader title="История оплат" />
        {payments.length ? (
          <div className={styles.payments}>
            {payments.map((payment) => (
              <div key={payment.id} className={styles.payment}>
                <span>{formatDate(payment.createdAt)}</span>
                <strong>{payment.amount ? formatMoney(payment.amount) : "Бесплатно"}</strong>
                <small>
                  {payment.months} мес., до {formatDate(payment.periodEnd)}
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
