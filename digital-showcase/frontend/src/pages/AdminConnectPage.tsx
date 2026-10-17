import { CheckmarkCircle02Icon, Copy01Icon, Money03Icon, PlusSignIcon, WhatsappIcon } from "@hugeicons/core-free-icons";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { AcceptPaymentModal } from "../components/admin/AcceptPaymentModal";
import { useAdminPlans } from "../state/adminPlans";
import type { Lead, Settings, Store, TrialPeriod, User } from "../types/models";
import { whatsappUrl } from "../utils/contact";
import { formatDate, formatTrial } from "../utils/format";
import {
  Button,
  ButtonLink,
  Card,
  CardHeader,
  Field,
  Icon,
  Input,
  Notice,
  Page,
  PageHeader,
  SegmentedControl,
  Select,
  Textarea,
  useCopyToClipboard
} from "../ui";
import styles from "./AdminConnectPage.module.css";

/** «14:days», «1:months» — a trial as a choice value. */
const trialKey = (trial: TrialPeriod) => `${trial.count}:${trial.unit}`;

function parseTrialKey(key: string): TrialPeriod {
  const [count, unit] = key.split(":");
  return { count: Number(count), unit: unit === "months" ? "months" : "days" };
}

const baseTrialOptions: TrialPeriod[] = [
  { count: 0, unit: "days" },
  { count: 7, unit: "days" },
  { count: 14, unit: "days" },
  { count: 1, unit: "months" }
];

const emptyForm = { ownerName: "", phone: "", email: "", storeName: "", slug: "", storePhone: "" };
type Form = typeof emptyForm;
type SlugState = { status: "idle" | "checking" | "ok" | "taken"; message?: string };

interface Connected {
  owner: User;
  store: Store;
  password: string;
}

/** «4827 1936» — groups of four are easier to read aloud. */
function formatPassword(password: string) {
  return /^\d{8}$/.test(password) ? `${password.slice(0, 4)} ${password.slice(4)}` : password;
}

function welcomeMessage({ owner, store, password }: Connected) {
  const origin = window.location.origin;
  return [
    `Здравствуйте, ${owner.name}! Ваша витрина «${store.name}» готова: ${origin}/m/${store.slug}`,
    "",
    `Кабинет, чтобы добавлять товары: ${origin}/login`,
    `Логин: ${owner.phone}`,
    `Пароль: ${password}`,
    "",
    store.subscriptionEndsAt ? `Пробный период — до ${formatDate(store.subscriptionEndsAt)}.` : "",
    "Добавьте первые товары и отправьте ссылку на витрину покупателям. Если что-то непонятно — пишите сюда, поможем."
  ]
    .filter((line, index, lines) => line || lines[index - 1])
    .join("\n");
}

/** «Подключить магазин»: owner, store, tariff and trial in one form, then a ready message for the client. */
export function AdminConnectPage() {
  const [params] = useSearchParams();
  const leadId = params.get("lead");
  const copy = useCopyToClipboard();
  const [form, setForm] = useState<Form>(emptyForm);
  const { plans } = useAdminPlans();
  const [planId, setPlanId] = useState("");
  // The first plan shown on the landing — what a new client most likely asked about.
  const defaultPlanId = plans?.find((plan) => plan.isPublic)?.id ?? plans?.[0]?.id ?? "";
  const chosenPlan = plans?.find((plan) => plan.id === (planId || defaultPlanId));
  // Empty — the trial from «Тарифы и цены»; it's also among the choices.
  const [trial, setTrial] = useState("");
  const [defaultTrial, setDefaultTrial] = useState<TrialPeriod>({ count: 14, unit: "days" });
  const trialOptions = [...baseTrialOptions, ...(baseTrialOptions.some((item) => trialKey(item) === trialKey(defaultTrial)) ? [] : [defaultTrial])].map((item) => ({
    value: trialKey(item),
    label: item.count ? formatTrial(item) : "Нет"
  }));
  const [slugState, setSlugState] = useState<SlugState>({ status: "idle" });

  useEffect(() => {
    api
      .get<{ settings: Settings }>("/admin/settings")
      .then((res) => setDefaultTrial(res.data.settings.trial))
      .catch(() => undefined);
  }, []);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [connected, setConnected] = useState<Connected | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  // Until the admin edits the address, it follows the store name.
  const slugTouched = useRef(false);

  // Prefill from a landing-page request.
  useEffect(() => {
    if (!leadId) return;
    api
      .get<Lead[]>("/admin/leads")
      .then((res) => {
        const lead = res.data.find((item) => item.id === leadId);
        if (lead) setForm((current) => ({ ...current, ownerName: lead.name, phone: lead.phone, storeName: lead.storeName ?? "" }));
      })
      .catch(() => undefined);
  }, [leadId]);

  // A free address for the store name.
  useEffect(() => {
    if (slugTouched.current || !form.storeName.trim()) return;
    const timer = window.setTimeout(() => {
      api
        .get<{ slug: string }>("/admin/slug", { params: { name: form.storeName } })
        .then((res) => {
          if (slugTouched.current) return;
          setForm((current) => ({ ...current, slug: res.data.slug }));
          setSlugState({ status: "ok" });
        })
        .catch(() => undefined);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [form.storeName]);

  // An address typed by hand: is it free?
  useEffect(() => {
    if (!slugTouched.current || !form.slug) return;
    setSlugState({ status: "checking" });
    const timer = window.setTimeout(() => {
      api
        .get<{ available: boolean; message?: string }>("/admin/slug", { params: { slug: form.slug } })
        .then((res) => setSlugState(res.data.available ? { status: "ok" } : { status: "taken", message: res.data.message }))
        .catch(() => setSlugState({ status: "idle" }));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [form.slug]);

  function field(name: keyof Form) {
    return {
      value: form[name],
      onChange: (event: { target: { value: string } }) => {
        const value = event.target.value;
        if (name === "slug") slugTouched.current = true;
        setForm((current) => ({ ...current, [name]: name === "slug" ? value.toLowerCase().replace(/\s+/g, "-") : value }));
        setError("");
      }
    };
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    try {
      const { data } = await api.post<Connected>("/admin/connect", {
        ...form,
        email: form.email || null,
        storePhone: form.storePhone || null,
        planId: planId || defaultPlanId || null,
        trial: parseTrialKey(trial || trialKey(defaultTrial)),
        leadId
      });
      setConnected(data);
      window.scrollTo(0, 0);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Не удалось подключить магазин");
    } finally {
      setIsSaving(false);
    }
  }

  function startOver() {
    setConnected(null);
    setForm(emptyForm);
    setPlanId("");
    setTrial("");
    setSlugState({ status: "idle" });
    slugTouched.current = false;
  }

  if (connected) {
    const message = welcomeMessage(connected);
    const storeUrl = `${window.location.origin}/m/${connected.store.slug}`;
    return (
      <Page width="narrow">
        <PageHeader title="Магазин подключён" back={{ to: "/admin", label: "В админку" }} />
        <Card padding="lg" className={styles.result}>
          <div className={styles.done}>
            <Icon icon={CheckmarkCircle02Icon} size="lg" />
            <div>
              <strong>{connected.store.name}</strong>
              <a href={storeUrl} target="_blank" rel="noreferrer">
                {storeUrl.replace(/^https?:\/\//, "")}
              </a>
            </div>
          </div>
          <div className={styles.credentials}>
            <div>
              <span>Логин</span>
              <strong>{connected.owner.phone}</strong>
            </div>
            <div>
              <span>Пароль</span>
              <strong className={styles.password}>{formatPassword(connected.password)}</strong>
            </div>
          </div>
          <Notice tone="warning">Пароль показывается один раз. Отправьте его владельцу сейчас.</Notice>
          <Field label="Сообщение владельцу">
            <Textarea rows={9} value={message} readOnly />
          </Field>
          <div className={styles.actions}>
            {connected.owner.phone && (
              <ButtonLink variant="primary" icon={WhatsappIcon} href={whatsappUrl(connected.owner.phone, message)} target="_blank" rel="noreferrer">
                Отправить в WhatsApp
              </ButtonLink>
            )}
            <Button variant="secondary" icon={Copy01Icon} onClick={() => copy(message, "Сообщение скопировано")}>
              Скопировать
            </Button>
            <Button variant="outline" icon={Money03Icon} onClick={() => setIsPaying(true)}>
              Продлить
            </Button>
            <Button variant="ghost" icon={PlusSignIcon} onClick={startOver}>
              Подключить ещё
            </Button>
          </div>
        </Card>
        {isPaying && (
          <AcceptPaymentModal
            store={connected.store}
            onClose={() => setIsPaying(false)}
            onPaid={(store) => {
              setIsPaying(false);
              setConnected((current) => current && { ...current, store });
            }}
          />
        )}
      </Page>
    );
  }

  return (
    <Page width="narrow">
      <PageHeader
        title="Подключить магазин"
        description="Владелец, магазин и пробный период — одной формой. Пароль придумается сам."
        back={{ to: "/admin", label: "В админку" }}
      />
      <form className={styles.form} onSubmit={submit}>
        <Card as="section" padding="lg" className={styles.section}>
          <CardHeader title="Владелец" />
          <Field label="Имя" required>
            <Input autoComplete="off" required {...field("ownerName")} />
          </Field>
          <Field label="Телефон" hint="Это логин владельца. Подойдёт любой формат: 8 928…, +7 928…" required>
            <Input type="tel" inputMode="tel" autoComplete="off" required {...field("phone")} />
          </Field>
          <Field label="Почта" hint="Необязательно — можно входить и по почте">
            <Input type="email" autoComplete="off" {...field("email")} />
          </Field>
        </Card>

        <Card as="section" padding="lg" className={styles.section}>
          <CardHeader title="Магазин" />
          <Field label="Название" required>
            <Input autoComplete="off" required {...field("storeName")} />
          </Field>
          <Field
            label="Адрес витрины"
            required
            error={slugState.status === "taken" ? slugState.message : undefined}
            hint={form.slug ? `${window.location.host}/m/${form.slug}` : "Заполнится по названию"}
          >
            <Input autoComplete="off" required {...field("slug")} />
          </Field>
          <Field label="Номер для покупателей" hint="WhatsApp и звонки с витрины. Пусто — телефон владельца">
            <Input type="tel" inputMode="tel" autoComplete="off" {...field("storePhone")} />
          </Field>
        </Card>

        <Card as="section" padding="lg" className={styles.section}>
          <CardHeader title="Тариф" />
          {plans && plans.length > 0 && (
            <Field
              label="Тариф"
              hint={chosenPlan && `${chosenPlan.price != null ? `${chosenPlan.price.toLocaleString("ru-RU")} ₽ в месяц` : "Цена по запросу"} · ${chosenPlan.aiEnabled ? `ИИ: ${chosenPlan.aiMonthlyLimit} карточек в месяц` : "без ИИ"}`}
            >
              <Select
                value={planId || defaultPlanId}
                onChange={setPlanId}
                options={plans.map((plan) => ({ value: plan.id, label: plan.isPublic ? plan.name : `${plan.name} (скрыт с лендинга)` }))}
              />
            </Field>
          )}
          <div className={styles.group}>
            <span className={styles.groupLabel}>Пробный период</span>
            <SegmentedControl label="Пробный период" value={trial || trialKey(defaultTrial)} onChange={setTrial} options={trialOptions} />
          </div>
        </Card>

        {error && <Notice tone="danger">{error}</Notice>}
        <Button type="submit" variant="primary" size="lg" block loading={isSaving} disabled={slugState.status === "taken"}>
          Подключить магазин
        </Button>
      </form>
    </Page>
  );
}
