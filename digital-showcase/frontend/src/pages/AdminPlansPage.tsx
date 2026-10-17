import { Edit02Icon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import { PlanCard } from "../components/landing/PlanCard";
import type { Settings } from "../types/models";
import { ButtonLink, Card, ErrorState, LoadingState, Page, PageHeader } from "../ui";
import { plural } from "../utils/format";
import styles from "./AdminPlansPage.module.css";

/**
 * «Тарифы и цены»: the plans exactly as the landing shows them, plus the
 * trial and the AI limit. Changing them is a separate page («Редактировать
 * тарифы»), so a look here can't change anything by accident.
 */
export function AdminPlansPage() {
  const [settings, setSettings] = useState<Settings>();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  function load() {
    setState("loading");
    api
      .get<{ settings: Settings }>("/admin/settings")
      .then((res) => {
        setSettings(res.data.settings);
        setState("ready");
      })
      .catch(() => setState("error"));
  }

  useEffect(load, []);

  return (
    <Page>
      <PageHeader
        title="Тарифы и цены"
        description="Так тарифы видят на лендинге. Цена тарифа магазина подставляется в «Продлить»"
        back={{ to: "/admin?tab=sections", label: "В админку" }}
      />
      {state === "error" && <ErrorState onRetry={load} />}
      {state === "loading" && <LoadingState />}
      {state === "ready" && settings && (
        <>
          <div className={styles.plans}>
            <PlanCard plan={settings.plans.basic} />
            <PlanCard
              plan={settings.plans.ai}
              extra={settings.aiMonthlyLimit > 0 ? `До ${settings.aiMonthlyLimit} карточек с ИИ в месяц` : undefined}
              highlighted
            />
          </div>
          <Card padding="lg" className={styles.facts}>
            <div>
              <span>Пробный период</span>
              <strong>
                {settings.trialDays} {plural(settings.trialDays, ["день", "дня", "дней"])}
              </strong>
            </div>
            <div>
              <span>Карточек с ИИ в месяц</span>
              <strong>{settings.aiMonthlyLimit}</strong>
            </div>
          </Card>
          <ButtonLink variant="primary" size="lg" icon={Edit02Icon} to="/admin/plans/edit" className={styles.edit}>
            Редактировать тарифы
          </ButtonLink>
        </>
      )}
    </Page>
  );
}
