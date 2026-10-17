import { ArrowDown01Icon, ArrowUp01Icon, Calendar03Icon, Edit02Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { type FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import { PlanCard } from "../components/landing/PlanCard";
import { useAdminPlans } from "../state/adminPlans";
import { refreshSiteSettings } from "../state/siteSettings";
import type { AdminPlan, Settings, TrialPeriod } from "../types/models";
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

const trialUnits: { value: TrialPeriod["unit"]; label: string }[] = [
  { value: "days", label: "Дней" },
  { value: "months", label: "Месяцев" }
];
import styles from "./AdminPlansPage.module.css";

/**
 * «Тарифы и цены»: every plan as the landing shows it, in landing order. Each
 * card has its own «Редактировать» (one plan at a time), arrows to move it,
 * and says whether it is hidden and how many stores are on it. The trial,
 * shared by all plans, changes in a small window here.
 */
export function AdminPlansPage() {
  const toast = useToast();
  const { plans, setPlans, reload } = useAdminPlans();
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

  return (
    <Page>
      <PageHeader
        title="Тарифы и цены"
        description="Так тарифы видят на лендинге, в этом порядке. Цена тарифа магазина подставляется в «Продлить»"
        back={{ to: "/admin?tab=sections", label: "В админку" }}
        actions={
          <ButtonLink variant="primary" icon={PlusSignIcon} to="/admin/plans/new">
            Добавить тариф
          </ButtonLink>
        }
      />
      {plans === null && <ErrorState onRetry={reload} />}
      {plans === undefined && <LoadingState />}
      {plans && !plans.length && <EmptyState title="Тарифов нет" description="Добавьте первый — без него магазин не подключить." />}
      {plans && plans.length > 0 && (
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

      {settings && (
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
