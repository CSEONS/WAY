import { ArrowDown01Icon, ArrowUp01Icon, Delete02Icon, FloppyDiskIcon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { PlanCard } from "../components/landing/PlanCard";
import { refreshSiteSettings } from "../state/siteSettings";
import type { AdminPlan, Plan } from "../types/models";
import {
  Button,
  Card,
  CardHeader,
  ConfirmModal,
  ErrorState,
  Field,
  IconButton,
  Input,
  LoadingState,
  Notice,
  Page,
  PageHeader,
  SectionLabel,
  Switch,
  Textarea,
  useToast
} from "../ui";
import { plural } from "../utils/format";
import { PRICE_ERROR, parsePrice } from "../utils/price";
import styles from "./AdminPlanEditPage.module.css";

const MAX_FEATURES = 12;
const MAX_FEATURE_LENGTH = 120;
/** A new plan with AI starts with this many cards a month. */
const DEFAULT_AI_LIMIT = 100;

interface FeatureRow {
  id: number;
  text: string;
}

interface Form {
  name: string;
  price: string;
  /** «Цена по запросу» instead of a number on the landing. */
  onRequest: boolean;
  description: string;
  features: FeatureRow[];
  aiEnabled: boolean;
  aiMonthlyLimit: string;
  isPublic: boolean;
  highlighted: boolean;
}

/**
 * One plan: a new one (/admin/plans/new) or an existing one
 * (/admin/plans/:id/edit), with its card as the landing will show it next to
 * the form. What it costs, what's in it, what it unlocks (the AI helper and
 * its monthly limit), whether the landing shows and accents it. A plan nobody
 * is on can be deleted.
 */
export function AdminPlanEditPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const toast = useToast();
  const [plan, setPlan] = useState<AdminPlan | null>(null);
  const [form, setForm] = useState<Form>();
  const [state, setState] = useState<"loading" | "ready" | "error" | "missing">("loading");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const nextId = useRef(0);

  function row(text: string): FeatureRow {
    nextId.current += 1;
    return { id: nextId.current, text };
  }

  function load() {
    if (isNew) {
      setForm({
        name: "",
        price: "",
        onRequest: false,
        description: "",
        features: [row("")],
        aiEnabled: false,
        aiMonthlyLimit: String(DEFAULT_AI_LIMIT),
        isPublic: true,
        highlighted: false
      });
      setState("ready");
      return;
    }
    setState("loading");
    api
      .get<AdminPlan[]>("/admin/plans")
      .then((res) => {
        const found = res.data.find((item) => item.id === id);
        if (!found) {
          setState("missing");
          return;
        }
        setPlan(found);
        setForm({
          name: found.name,
          price: found.price == null ? "" : String(found.price),
          onRequest: found.price == null,
          description: found.description,
          features: found.features.map(row),
          aiEnabled: Boolean(found.aiEnabled),
          aiMonthlyLimit: String(found.aiMonthlyLimit ?? DEFAULT_AI_LIMIT),
          isPublic: Boolean(found.isPublic),
          highlighted: Boolean(found.highlighted)
        });
        setState("ready");
      })
      .catch(() => setState("error"));
  }

  useEffect(load, [id]);

  if (state === "missing") return <Navigate to="/admin/plans" replace />;

  function change(patch: Partial<Form>) {
    setForm((current) => current && { ...current, ...patch });
    setError("");
  }

  function changeFeature(featureId: number, text: string) {
    setForm((current) => current && { ...current, features: current.features.map((item) => (item.id === featureId ? { ...item, text } : item)) });
  }

  function moveFeature(index: number, step: -1 | 1) {
    setForm((current) => {
      if (!current) return current;
      const features = [...current.features];
      const target = index + step;
      if (target < 0 || target >= features.length) return current;
      [features[index], features[target]] = [features[target], features[index]];
      return { ...current, features };
    });
  }

  const price = form && !form.onRequest ? parsePrice(form.price) : null;
  const priceError = form && !form.onRequest && (form.price.trim() === "" || Number.isNaN(price)) ? PRICE_ERROR : "";
  const limit = Number(form?.aiMonthlyLimit);
  const limitLine = form?.aiEnabled && Number.isInteger(limit) && limit > 0 ? `До ${limit} карточек с ИИ в месяц` : undefined;

  /** The card as the landing will show it, from what is typed right now. */
  const preview: Plan | null = form
    ? {
        name: form.name.trim() || "Название тарифа",
        price: price != null && !Number.isNaN(price) ? price : null,
        description: form.description.trim(),
        features: form.features.map((item) => item.text.trim()).filter(Boolean)
      }
    : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form || !preview) return;
    if (priceError) {
      setError("Укажите цену числом или включите «Цена по запросу»");
      return;
    }
    setIsSaving(true);
    setError("");
    const payload = {
      name: form.name,
      price: form.onRequest ? null : form.price,
      description: form.description,
      features: preview.features,
      aiEnabled: form.aiEnabled,
      aiMonthlyLimit: form.aiEnabled ? form.aiMonthlyLimit : null,
      isPublic: form.isPublic,
      highlighted: form.highlighted
    };
    try {
      const { data } = isNew ? await api.post<AdminPlan>("/admin/plans", payload) : await api.put<AdminPlan>(`/admin/plans/${id}`, payload);
      refreshSiteSettings();
      toast.show(isNew ? `Тариф «${data.name}» добавлен` : `Тариф «${data.name}» сохранён`, { tone: "success" });
      navigate("/admin/plans");
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Не удалось сохранить тариф");
    } finally {
      setIsSaving(false);
    }
  }

  async function remove() {
    if (!plan) return;
    try {
      await api.delete(`/admin/plans/${plan.id}`);
      refreshSiteSettings();
      toast.show(`Тариф «${plan.name}» удалён`, { tone: "success" });
      navigate("/admin/plans");
    } catch (err: any) {
      setIsDeleteOpen(false);
      setError(err?.response?.data?.message ?? "Не удалось удалить тариф");
    }
  }

  const header = (
    <PageHeader
      title={isNew ? "Новый тариф" : form ? `Тариф «${form.name.trim() || "без названия"}»` : "Тариф"}
      description="Изменения сразу видны на лендинге и в «Продлить»"
      back={{ to: "/admin/plans", label: "К тарифам" }}
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
  if (!form || !preview) {
    return (
      <Page>
        {header}
        <LoadingState />
      </Page>
    );
  }

  return (
    <Page>
      {header}
      <div className={styles.layout}>
        <form className={styles.form} onSubmit={submit}>
          <Card as="section" padding="lg" className={styles.section}>
            <CardHeader title="Название и цена" />
            <Field label="Название" required>
              <Input value={form.name} maxLength={60} placeholder="Например, «Старт»" onChange={(event) => change({ name: event.target.value })} required />
            </Field>
            <Switch
              checked={form.onRequest}
              onChange={(onRequest) => change({ onRequest })}
              label="Цена по запросу"
              description="Вместо цены на лендинге будет «Цена по запросу» и кнопка «Узнать цену»"
            />
            {!form.onRequest && (
              <Field label="Цена в месяц" hint="Подставляется в «Продлить», умноженная на период" error={form.price.trim() ? priceError : ""} required>
                <div className={styles.unitInput}>
                  <Input inputMode="numeric" placeholder="500" value={form.price} onChange={(event) => change({ price: event.target.value })} />
                  <span>₽ в месяц</span>
                </div>
              </Field>
            )}
          </Card>

          <Card as="section" padding="lg" className={styles.section}>
            <CardHeader title="Что даёт тариф" description="Пункты ниже — только текст, а это включает возможности" />
            <Switch
              checked={form.aiEnabled}
              onChange={(aiEnabled) => change({ aiEnabled })}
              label="ИИ-помощник"
              description="Карточка товара по фото и голосу, много товаров сразу, превью с ИИ"
            />
            {form.aiEnabled && (
              <Field label="Карточек с ИИ в месяц" hint="Для магазинов на этом тарифе; у магазина можно задать свой лимит в его карточке">
                <div className={styles.unitInput}>
                  <Input inputMode="numeric" value={form.aiMonthlyLimit} onChange={(event) => change({ aiMonthlyLimit: event.target.value })} />
                  <span>в месяц</span>
                </div>
              </Field>
            )}
            {plan && plan.storeCount > 0 && plan.aiEnabled !== Number(form.aiEnabled) && (
              <Notice tone="warning">
                {form.aiEnabled ? "ИИ включится" : "ИИ выключится"} сразу у {plan.storeCount} {plural(plan.storeCount, ["магазина", "магазинов", "магазинов"])} на этом тарифе.
              </Notice>
            )}
          </Card>

          <Card as="section" padding="lg" className={styles.section}>
            <CardHeader title="Описание" description="Одно-два предложения под названием" />
            <Field label="Описание">
              <Textarea rows={2} maxLength={300} value={form.description} onChange={(event) => change({ description: event.target.value })} />
            </Field>
          </Card>

          <Card as="section" padding="lg" className={styles.section}>
            <CardHeader title="Что входит" description={`Пункты со значком ✓, до ${MAX_FEATURES}. Порядок — как на лендинге`} />
            {form.features.length > 0 ? (
              <ol className={styles.features}>
                {form.features.map((item, index) => (
                  <li key={item.id} className={styles.feature}>
                    <span className={styles.number}>{index + 1}</span>
                    <Input
                      aria-label={`Пункт ${index + 1}`}
                      value={item.text}
                      maxLength={MAX_FEATURE_LENGTH}
                      placeholder="Например, «Кнопки WhatsApp и звонка»"
                      onChange={(event) => changeFeature(item.id, event.target.value)}
                    />
                    <div className={styles.featureActions}>
                      <IconButton icon={ArrowUp01Icon} label="Выше" size="sm" disabled={index === 0} onClick={() => moveFeature(index, -1)} />
                      <IconButton icon={ArrowDown01Icon} label="Ниже" size="sm" disabled={index === form.features.length - 1} onClick={() => moveFeature(index, 1)} />
                      <IconButton
                        icon={Delete02Icon}
                        label="Удалить пункт"
                        size="sm"
                        onClick={() => change({ features: form.features.filter((feature) => feature.id !== item.id) })}
                      />
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className={styles.muted}>Пунктов нет — на карточке будут только название, описание и цена.</p>
            )}
            {limitLine && <p className={styles.muted}>Последней строкой лендинг сам добавит «{limitLine}».</p>}
            <Button
              variant="secondary"
              icon={PlusSignIcon}
              className={styles.add}
              disabled={form.features.length >= MAX_FEATURES}
              onClick={() => change({ features: [...form.features, row("")] })}
            >
              Добавить пункт
            </Button>
          </Card>

          <Card as="section" padding="lg" className={styles.section}>
            <CardHeader title="На лендинге" />
            <Switch
              checked={form.isPublic}
              onChange={(isPublic) => change({ isPublic })}
              label="Показывать на лендинге"
              description="Скрытый тариф не видно новым клиентам, но магазины на нём работают как прежде"
            />
            <Switch
              checked={form.highlighted}
              onChange={(highlighted) => change({ highlighted })}
              label="Выделить"
              description="Рамка и синяя кнопка — тариф, который стоит выбрать. Выделен может быть только один"
            />
          </Card>

          {error && <Notice tone="danger">{error}</Notice>}
          <Button type="submit" variant="primary" size="lg" icon={FloppyDiskIcon} block loading={isSaving}>
            {isNew ? "Добавить тариф" : "Сохранить тариф"}
          </Button>
          {plan &&
            (plan.storeCount > 0 ? (
              <p className={styles.muted}>
                На тарифе {plan.storeCount} {plural(plan.storeCount, ["магазин", "магазина", "магазинов"])} — удалить его нельзя. Чтобы новые клиенты его не видели,
                выключите «Показывать на лендинге».
              </p>
            ) : (
              <Button variant="ghost" icon={Delete02Icon} className={styles.delete} onClick={() => setIsDeleteOpen(true)}>
                Удалить тариф
              </Button>
            ))}
        </form>

        <aside className={styles.preview} aria-label="Как тариф выглядит на лендинге">
          <SectionLabel>{form.isPublic ? "Так увидят на лендинге" : "Скрыт с лендинга — так выглядел бы"}</SectionLabel>
          <PlanCard plan={preview} highlighted={form.highlighted} extra={limitLine} />
        </aside>
      </div>

      {isDeleteOpen && plan && (
        <ConfirmModal
          title={`Удалить тариф «${plan.name}»?`}
          description="Он пропадёт с лендинга и из выбора тарифа. Магазинов на нём нет."
          confirmLabel="Удалить"
          danger
          onCancel={() => setIsDeleteOpen(false)}
          onConfirm={remove}
        />
      )}
    </Page>
  );
}
