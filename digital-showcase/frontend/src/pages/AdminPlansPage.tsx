import { ArrowDown01Icon, ArrowUp01Icon, Calendar03Icon, Edit02Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { type FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { PackageCard } from "../components/landing/PackageCard";
import { PlanCard } from "../components/landing/PlanCard";
import { useAdminPackages } from "../state/adminPackages";
import { useAdminPlans } from "../state/adminPlans";
import { refreshSiteSettings } from "../state/siteSettings";
import type { AdminPackage, AdminPlan, Settings, TrialPeriod } from "../types/models";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Input,
  LoadingState,
  Modal,
  Page,
  PageHeader,
  SegmentedControl,
  useToast
} from "../ui";
import { formatTrial, plural } from "../utils/format";
import styles from "./AdminPlansPage.module.css";

const trialUnits: { value: TrialPeriod["unit"]; label: string }[] = [
  { value: "days", label: "Дней" },
  { value: "months", label: "Месяцев" }
];

type View = "plans" | "packages";

/** The switch on top and where its «Добавить» button leads in each view. */
const views: Record<View, { label: string; to: string }> = {
  plans: { label: "Тарифы", to: "/admin/plans/new" },
  packages: { label: "Пакеты", to: "/admin/packages/new" }
};

/**
 * «Тарифы и цены», with a switch on top between plans and packages (kept in
 * the address: ?view=packages). Plans: every plan as the landing shows it, in
 * landing order, each with its own «Редактировать» (one plan at a time),
 * arrows to move it, whether it is hidden and how many stores are on it; the
 * trial, shared by all plans, changes in a small window. Packages — bought on
 * top of any plan — are laid out the same way.
 */
export function AdminPlansPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const view: View = params.get("view") === "packages" ? "packages" : "plans";
  const { plans, setPlans, reload } = useAdminPlans();
  const { packages, setPackages, reload: reloadPackages } = useAdminPackages();
  const [settings, setSettings] = useState<Settings>();
  /** The trial being edited: the count as typed. */
  const [trialDraft, setTrialDraft] = useState<{ count: string; unit: TrialPeriod["unit"] } | null>(null);
  const [trialError, setTrialError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    api
      .get<{ settings: Settings }>("/admin/settings")
      .then((res) => setSettings(res.data.settings))
      .catch(() => undefined);
  }, []);

  async function move(index: number, step: -1 | 1) {
    if (!plans) return;
    const ids = plans.map((plan) => plan.id);
    [ids[index], ids[index + step]] = [ids[index + step], ids[index]];
    try {
      setPlans((await api.post<AdminPlan[]>("/admin/plans/order", { ids })).data);
      refreshSiteSettings();
    } catch {
      toast.show("Не удалось поменять порядок", { tone: "danger" });
    }
  }

  async function movePackage(index: number, step: -1 | 1) {
    if (!packages) return;
    const ids = packages.map((item) => item.id);
    [ids[index], ids[index + step]] = [ids[index + step], ids[index]];
    try {
      setPackages((await api.post<AdminPackage[]>("/admin/packages/order", { ids })).data);
      refreshSiteSettings();
    } catch {
      toast.show("Не удалось поменять порядок", { tone: "danger" });
    }
  }

  async function saveTrial(event: FormEvent) {
    event.preventDefault();
    if (!settings || trialDraft == null) return;
    setIsSaving(true);
    setTrialError("");
    try {
      const { data } = await api.put<{ settings: Settings }>("/admin/settings", { ...settings, trial: trialDraft });
      setSettings(data.settings);
      setTrialDraft(null);
      toast.show(`Пробный период — ${formatTrial(data.settings.trial)}`, { tone: "success" });
    } catch (err: any) {
      setTrialError(err?.response?.data?.message ?? "Не удалось сохранить");
    } finally {
      setIsSaving(false);
    }
  }

  const counts: Record<View, number | undefined> = { plans: plans?.length, packages: packages?.length };

  return (
    <Page>
      <PageHeader title="Тарифы и цены" back={{ to: "/admin?tab=sections", label: "В админку" }} />

      <div className={styles.toolbar}>
        <SegmentedControl
          label="Что показать"
          value={view}
          onChange={(value) => setParams(value === "plans" ? {} : { view: value }, { replace: true })}
          options={(Object.keys(views) as View[]).map((value) => ({
            value,
            label: counts[value] == null ? views[value].label : `${views[value].label} · ${counts[value]}`
          }))}
          className={styles.views}
        />
        <ButtonLink variant="primary" icon={PlusSignIcon} to={views[view].to}>
          Добавить
        </ButtonLink>
      </div>

      {view === "plans" && plans === null && <ErrorState onRetry={reload} />}
      {view === "plans" && plans === undefined && <LoadingState />}
      {view === "plans" && plans && !plans.length && <EmptyState title="Тарифов нет" description="Добавьте первый — без него магазин не подключить." />}
      {view === "plans" && plans && plans.length > 0 && (
        <div className={styles.plans}>
          {plans.map((plan, index) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              highlighted={Boolean(plan.highlighted)}
              extra={plan.aiEnabled && plan.aiMonthlyLimit ? `До ${plan.aiMonthlyLimit} карточек с ИИ в месяц` : undefined}
              action={
                <div className={styles.footer}>
                  <div className={styles.badges}>
                    {!plan.isPublic && <Badge tone="warning">Скрыт с лендинга</Badge>}
                    <Badge tone={plan.aiEnabled ? "accent" : "neutral"}>{plan.aiEnabled ? "С ИИ" : "Без ИИ"}</Badge>
                    <Badge>
                      {plan.storeCount} {plural(plan.storeCount, ["магазин", "магазина", "магазинов"])}
                    </Badge>
                  </div>
                  <div className={styles.actions}>
                    <ButtonLink variant="secondary" icon={Edit02Icon} to={`/admin/plans/${plan.id}/edit`} className={styles.edit}>
                      Редактировать
                    </ButtonLink>
                    <IconButton icon={ArrowUp01Icon} label="Левее на лендинге" variant="outline" disabled={index === 0} onClick={() => move(index, -1)} />
                    <IconButton icon={ArrowDown01Icon} label="Правее на лендинге" variant="outline" disabled={index === plans.length - 1} onClick={() => move(index, 1)} />
                  </div>
                </div>
              }
            />
          ))}
        </div>
      )}

      {view === "plans" && settings && (
        <Card padding="lg" className={styles.trial}>
          <div className={styles.fact}>
            <span>Пробный период для новых магазинов</span>
            <strong>{formatTrial(settings.trial)}</strong>
          </div>
          <Button variant="secondary" icon={Calendar03Icon} onClick={() => setTrialDraft({ count: String(settings.trial.count), unit: settings.trial.unit })}>
            Изменить
          </Button>
        </Card>
      )}

      {view === "packages" && packages === null && <ErrorState onRetry={reloadPackages} />}
      {view === "packages" && packages === undefined && <LoadingState />}
      {view === "packages" && packages && !packages.length && (
        <EmptyState title="Пакетов нет" description="Например, «+10 ИИ-превью», «+100 карточек с ИИ» или «Помощь с первым заполнением»." />
      )}
      {view === "packages" && packages && packages.length > 0 && (
        <div className={styles.plans}>
          {packages.map((item, index) => (
            <PackageCard
              key={item.id}
              item={item}
              action={
                <div className={styles.footer}>
                  <div className={styles.badges}>
                    {!item.isPublic && <Badge tone="warning">Скрыт</Badge>}
                    {Boolean(item.isService) && <Badge tone="accent">Услуга</Badge>}
                    <Badge>{item.soldCount ? `Куплен ${item.soldCount} ${plural(item.soldCount, ["раз", "раза", "раз"])}` : "Не покупали"}</Badge>
                  </div>
                  <div className={styles.actions}>
                    <ButtonLink variant="secondary" icon={Edit02Icon} to={`/admin/packages/${item.id}/edit`} className={styles.edit}>
                      Редактировать
                    </ButtonLink>
                    <IconButton icon={ArrowUp01Icon} label="Левее на лендинге" variant="outline" disabled={index === 0} onClick={() => movePackage(index, -1)} />
                    <IconButton
                      icon={ArrowDown01Icon}
                      label="Правее на лендинге"
                      variant="outline"
                      disabled={index === packages.length - 1}
                      onClick={() => movePackage(index, 1)}
                    />
                  </div>
                </div>
              }
            />
          ))}
        </div>
      )}

      {trialDraft != null && (
        <Modal
          title="Пробный период"
          description="Столько новый магазин работает бесплатно. Уже подключённых это не меняет"
          onClose={() => setTrialDraft(null)}
          onSubmit={saveTrial}
          footer={
            <>
              <Button variant="secondary" onClick={() => setTrialDraft(null)}>
                Отмена
              </Button>
              <Button type="submit" variant="primary" loading={isSaving}>
                Сохранить
              </Button>
            </>
          }
        >
          <SegmentedControl
            label="В чём считать"
            value={trialDraft.unit}
            // «30 дней» → months: 30 months would be refused, one month is what's meant.
            onChange={(unit) => setTrialDraft({ unit, count: unit === "months" && Number(trialDraft.count) > 12 ? "1" : trialDraft.count })}
            options={trialUnits}
          />
          <Field
            label={trialDraft.unit === "months" ? "Месяцев, от 1 до 12" : "Дней, от 1 до 60"}
            hint={trialDraft.unit === "months" ? "Месяц календарный: подключённый 31 января работает бесплатно до 28 февраля" : undefined}
            error={trialError}
          >
            <Input inputMode="numeric" autoFocus value={trialDraft.count} onChange={(event) => setTrialDraft({ ...trialDraft, count: event.target.value })} />
          </Field>
        </Modal>
      )}
    </Page>
  );
}
