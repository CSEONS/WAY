import { Delete02Icon, FloppyDiskIcon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { setSiteSettings } from "../state/siteSettings";
import type { HelpVideo, Legal, Plan, PreviewQuality, Settings } from "../types/models";
import { Button, Card, CardHeader, ErrorState, Field, IconButton, Input, LoadingState, Notice, Page, PageHeader, SegmentedControl, Switch, Textarea, useToast } from "../ui";
import styles from "./AdminSettingsPage.module.css";

interface SettingsResponse {
  settings: Settings;
  /** Models with a known price: suggestions for the model fields. */
  models: { text: string[]; image: string[] };
}

// Numbers are edited as text: an emptied field stays empty instead of jumping to 0.
// The server reads «1 500», «92,5» and the like.
type PlanDraft = Omit<Plan, "price" | "features"> & { price: string; features: string };
type Draft = Omit<Settings, "plans" | "legal" | "trialDays" | "aiMonthlyLimit" | "aiPreviewUnits" | "aiRubPerUsd"> & {
  plans: { basic: PlanDraft; ai: PlanDraft };
  legal: Omit<Legal, "keepDataDays"> & { keepDataDays: string };
  trialDays: string;
  aiMonthlyLimit: string;
  aiPreviewUnits: string;
  aiRubPerUsd: string;
};

const qualityOptions: { value: PreviewQuality; label: string }[] = [
  { value: "low", label: "Низкое" },
  { value: "medium", label: "Среднее" },
  { value: "high", label: "Высокое" }
];

function planDraft(plan: Plan): PlanDraft {
  return { ...plan, price: plan.price == null ? "" : String(plan.price), features: plan.features.join("\n") };
}

function toDraft(settings: Settings): Draft {
  return {
    ...settings,
    plans: { basic: planDraft(settings.plans.basic), ai: planDraft(settings.plans.ai) },
    legal: { ...settings.legal, keepDataDays: String(settings.legal.keepDataDays) },
    trialDays: String(settings.trialDays),
    aiMonthlyLimit: String(settings.aiMonthlyLimit),
    aiPreviewUnits: String(settings.aiPreviewUnits),
    aiRubPerUsd: settings.aiRubPerUsd == null ? "" : String(settings.aiRubPerUsd)
  };
}

function planPayload(plan: PlanDraft) {
  return { ...plan, features: plan.features.split("\n").map((line) => line.trim()).filter(Boolean) };
}

/** Text input bound to one value. */
function bind(value: string, onChange: (value: string) => void) {
  return { value, onChange: (event: { target: { value: string } }) => onChange(event.target.value) };
}

export type SettingsPart = "plans" | "ai" | "contacts" | "videos" | "legal";

const BACK_TO_SECTIONS = { to: "/admin?tab=sections", label: "В админку" };

/** Each part is its own section of the admin panel: title, what it's for, where «назад» leads. */
const PARTS: Record<SettingsPart, { title: string; description: string; back: { to: string; label: string }; saved: string }> = {
  plans: {
    title: "Редактирование тарифов",
    description: "Изменения сразу видны на лендинге и в «Продлить»",
    back: { to: "/admin/plans", label: "К тарифам" },
    saved: "Тарифы сохранены"
  },
  ai: { title: "Настройки ИИ", description: "Модели, курс рубля и превью. Сервер провайдера и ключ — в .env", back: BACK_TO_SECTIONS, saved: "Настройки ИИ сохранены" },
  contacts: { title: "Контакты", description: "Куда пишут владельцы магазинов и те, кто хочет подключиться", back: BACK_TO_SECTIONS, saved: "Контакты сохранены" },
  videos: { title: "Видеоинструкции", description: "Короткие видео в «Помощи» у владельцев", back: BACK_TO_SECTIONS, saved: "Видео сохранены" },
  legal: { title: "Реквизиты", description: "Для оферты и политики конфиденциальности", back: BACK_TO_SECTIONS, saved: "Реквизиты сохранены" }
};

/**
 * What used to need .env or a rebuild — one form over the same settings, a
 * page per part: «Тарифы и цены» → edit (plans, the AI limit, the trial),
 * «Настройки ИИ» (models, the ruble rate, previews), «Контакты»,
 * «Видеоинструкции», «Реквизиты». Saving sends all of it. Keys and provider
 * addresses stay in .env.
 */
export function AdminSettingsPage({ part }: { part: SettingsPart }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>();
  const [models, setModels] = useState<SettingsResponse["models"]>({ text: [], image: [] });
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  function apply(data: SettingsResponse) {
    setDraft(toDraft(data.settings));
    setModels(data.models);
    setState("ready");
  }

  function load() {
    setState("loading");
    api
      .get<SettingsResponse>("/admin/settings")
      .then((res) => apply(res.data))
      .catch(() => setState("error"));
  }

  useEffect(load, []);

  function change(patch: Partial<Draft>) {
    setDraft((current) => current && { ...current, ...patch });
    setError("");
  }

  function changePlan(which: "basic" | "ai", patch: Partial<PlanDraft>) {
    setDraft((current) => current && { ...current, plans: { ...current.plans, [which]: { ...current.plans[which], ...patch } } });
    setError("");
  }

  function changeLegal(patch: Partial<Draft["legal"]>) {
    setDraft((current) => current && { ...current, legal: { ...current.legal, ...patch } });
    setError("");
  }

  function changeVideo(index: number, patch: Partial<HelpVideo>) {
    setDraft((current) => current && { ...current, helpVideos: current.helpVideos.map((video, i) => (i === index ? { ...video, ...patch } : video)) });
    setError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setIsSaving(true);
    setError("");
    try {
      const { data } = await api.put<SettingsResponse>("/admin/settings", {
        ...draft,
        plans: { basic: planPayload(draft.plans.basic), ai: planPayload(draft.plans.ai) }
      });
      apply(data);
      const { plans, aiMonthlyLimit, demoStoreSlug, salesContacts, helpVideos, legal } = data.settings;
      setSiteSettings({ plans, aiMonthlyLimit, demoStoreSlug, salesContacts, helpVideos, legal });
      toast.show(PARTS[part].saved, { tone: "success" });
      // Plans are edited from their cards: back to them to see the result.
      if (part === "plans") navigate("/admin/plans");
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Не удалось сохранить настройки");
    } finally {
      setIsSaving(false);
    }
  }

  const header = <PageHeader title={PARTS[part].title} description={PARTS[part].description} back={PARTS[part].back} />;

  if (state === "error") {
    return (
      <Page width="narrow">
        {header}
        <ErrorState onRetry={load} />
      </Page>
    );
  }
  if (!draft) {
    return (
      <Page width="narrow">
        {header}
        <LoadingState />
      </Page>
    );
  }

  return (
    <Page width="narrow">
      {header}
      <form className={styles.form} onSubmit={submit}>
        {part === "plans" && (
          <Section title="Тарифы" description="Пустая цена — «Цена по запросу».">
            <div className={styles.plans}>
              <PlanFields title="Без ИИ" plan={draft.plans.basic} onChange={(patch) => changePlan("basic", patch)} />
              <PlanFields title="С ИИ-помощником" plan={draft.plans.ai} onChange={(patch) => changePlan("ai", patch)}>
                <Field label="Карточек с ИИ в месяц" hint="На лендинге — строкой «До N карточек с ИИ в месяц». Магазину можно задать свой лимит">
                  <Input inputMode="numeric" {...bind(draft.aiMonthlyLimit, (aiMonthlyLimit) => change({ aiMonthlyLimit }))} />
                </Field>
              </PlanFields>
            </div>
            <Field label="Пробный период, дней" hint="Столько новый магазин работает бесплатно, от 1 до 60">
              <Input inputMode="numeric" {...bind(draft.trialDays, (trialDays) => change({ trialDays }))} />
            </Field>
          </Section>
        )}

        {part === "ai" && (
          <Section title="ИИ" description="Сервер провайдера и ключ — в .env (AI_BASE_URL, AI_API_KEY)">
            <datalist id="text-models">
              {models.text.map((model) => (
                <option key={model} value={model} />
              ))}
            </datalist>
            <datalist id="image-models">
              {models.image.map((model) => (
                <option key={model} value={model} />
              ))}
            </datalist>
            <Field label="Модель для карточек" hint="Название как у провайдера. Дешевле всех — gpt-5.6-luna: копейки за карточку">
              <Input list="text-models" autoComplete="off" {...bind(draft.aiModel, (aiModel) => change({ aiModel }))} />
            </Field>
            <Field label="Курс, ₽ за $1" hint="Курс плюс комиссия посредника, если платите через него. По нему админка считает цену ИИ в рублях">
              <Input inputMode="decimal" placeholder="85" {...bind(draft.aiRubPerUsd, (aiRubPerUsd) => change({ aiRubPerUsd }))} />
            </Field>
            <Switch
              checked={draft.aiPreviewEnabled}
              onChange={(aiPreviewEnabled) => change({ aiPreviewEnabled })}
              label="Превью с ИИ"
              description="Кнопка в форме товара: ИИ рисует обложку для витрины по фото"
            />
            {draft.aiPreviewEnabled && (
              <>
                <Field label="Модель для превью">
                  <Input list="image-models" autoComplete="off" {...bind(draft.aiPreviewModel, (aiPreviewModel) => change({ aiPreviewModel }))} />
                </Field>
                <div className={styles.group}>
                  <span className={styles.groupLabel}>Качество превью</span>
                  <SegmentedControl label="Качество превью" value={draft.aiPreviewQuality} onChange={(aiPreviewQuality) => change({ aiPreviewQuality })} options={qualityOptions} />
                  <span className={styles.groupHint}>Среднее — надписи на обложке читаются, около 2 ₽. Низкое размывает текст, высокое в несколько раз дороже</span>
                </div>
                <Field label="Одно превью списывает карточек" hint="Из месячного лимита магазина">
                  <Input inputMode="numeric" {...bind(draft.aiPreviewUnits, (aiPreviewUnits) => change({ aiPreviewUnits }))} />
                </Field>
              </>
            )}
          </Section>
        )}

        {part === "contacts" && (
          <Section title="Контакты">
            <div className={styles.fields}>
              <Field label="WhatsApp поддержки" hint="Для владельцев: «Помощь» и «Подписка и итоги»">
                <Input type="tel" {...bind(draft.support.whatsapp, (whatsapp) => change({ support: { ...draft.support, whatsapp } }))} />
              </Field>
              <Field label="Телефон поддержки">
                <Input type="tel" {...bind(draft.support.phone, (phone) => change({ support: { ...draft.support, phone } }))} />
              </Field>
              <Field label="Telegram поддержки" hint="@имя или ссылка">
                <Input {...bind(draft.support.telegram, (telegram) => change({ support: { ...draft.support, telegram } }))} />
              </Field>
            </div>
            <div className={styles.fields}>
              <Field label="WhatsApp для заявок" hint="На лендинге, рядом с формой заявки">
                <Input type="tel" {...bind(draft.salesContacts.whatsapp, (whatsapp) => change({ salesContacts: { ...draft.salesContacts, whatsapp } }))} />
              </Field>
              <Field label="Телефон для заявок">
                <Input type="tel" {...bind(draft.salesContacts.phone, (phone) => change({ salesContacts: { ...draft.salesContacts, phone } }))} />
              </Field>
              <Field label="Демо-магазин" hint="Адрес витрины для «Посмотреть пример». Пусто — без кнопки">
                <Input autoComplete="off" {...bind(draft.demoStoreSlug, (demoStoreSlug) => change({ demoStoreSlug }))} />
              </Field>
            </div>
          </Section>
        )}

        {part === "videos" && (
          <Section title="Видеоинструкции" description="В «Помощи» у владельцев. Лучше по 30–60 секунд, одна задача на видео">
            {draft.helpVideos.map((video, index) => (
              <div key={index} className={styles.video}>
                <Field label="Название">
                  <Input {...bind(video.title, (title) => changeVideo(index, { title }))} />
                </Field>
                <Field label="Ссылка">
                  <Input type="url" placeholder="https://" {...bind(video.url, (url) => changeVideo(index, { url }))} />
                </Field>
                <IconButton
                  icon={Delete02Icon}
                  label="Убрать видео"
                  className={styles.remove}
                  onClick={() => change({ helpVideos: draft.helpVideos.filter((_, i) => i !== index) })}
                />
              </div>
            ))}
            <Button variant="secondary" icon={PlusSignIcon} className={styles.add} onClick={() => change({ helpVideos: [...draft.helpVideos, { title: "", url: "" }] })}>
              Добавить видео
            </Button>
          </Section>
        )}

        {part === "legal" && (
          <Section title="Реквизиты" description="Для оферты и политики конфиденциальности. Тексты стоит показать юристу">
            <div className={styles.fields}>
              <Field label="Исполнитель" hint="ФИО, «ИП …» или название компании">
                <Input {...bind(draft.legal.operator, (operator) => changeLegal({ operator }))} />
              </Field>
              <Field label="Статус">
                <Input {...bind(draft.legal.taxStatus, (taxStatus) => changeLegal({ taxStatus }))} />
              </Field>
              <Field label="ИНН">
                <Input inputMode="numeric" {...bind(draft.legal.inn, (inn) => changeLegal({ inn }))} />
              </Field>
              <Field label="ОГРН или ОГРНИП" hint="Самозанятому — пусто">
                <Input inputMode="numeric" {...bind(draft.legal.ogrn, (ogrn) => changeLegal({ ogrn }))} />
              </Field>
              <Field label="Почта" hint="Для вопросов о персональных данных">
                <Input type="email" {...bind(draft.legal.email, (email) => changeLegal({ email }))} />
              </Field>
              <Field label="Телефон">
                <Input type="tel" {...bind(draft.legal.phone, (phone) => changeLegal({ phone }))} />
              </Field>
              <Field label="Адрес" hint="Самозанятому достаточно города">
                <Input {...bind(draft.legal.address, (address) => changeLegal({ address }))} />
              </Field>
              <Field label="Дата редакции документов">
                <Input type="date" {...bind(draft.legal.updatedAt, (updatedAt) => changeLegal({ updatedAt }))} />
              </Field>
              <Field label="Хранить данные после оплаты, дней" hint="Потом админка напомнит удалить данные магазина">
                <Input inputMode="numeric" {...bind(draft.legal.keepDataDays, (keepDataDays) => changeLegal({ keepDataDays }))} />
              </Field>
            </div>
          </Section>
        )}

        {error && <Notice tone="danger">{error}</Notice>}
        <Button type="submit" variant="primary" size="lg" icon={FloppyDiskIcon} block loading={isSaving}>
          Сохранить
        </Button>
      </form>
    </Page>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card as="section" padding="lg" className={styles.section}>
      <CardHeader title={title} description={description} />
      {children}
    </Card>
  );
}

function PlanFields({ title, plan, onChange, children }: { title: string; plan: PlanDraft; onChange: (patch: Partial<PlanDraft>) => void; children?: ReactNode }) {
  return (
    <div className={styles.plan}>
      <h3 className={styles.planTitle}>{title}</h3>
      <Field label="Название">
        <Input {...bind(plan.name, (name) => onChange({ name }))} />
      </Field>
      <Field label="Цена, ₽ в месяц">
        <Input inputMode="numeric" placeholder="Цена по запросу" {...bind(plan.price, (price) => onChange({ price }))} />
      </Field>
      <Field label="Описание">
        <Textarea rows={2} {...bind(plan.description, (description) => onChange({ description }))} />
      </Field>
      <Field label="Что входит" hint="По пункту в строке">
        <Textarea rows={5} {...bind(plan.features, (features) => onChange({ features }))} />
      </Field>
      {children}
    </div>
  );
}
