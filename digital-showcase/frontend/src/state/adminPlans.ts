import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import type { AdminPlan } from "../types/models";

/**
 * Every plan for the admin panel, hidden ones too — the stores on them still
 * need their names and prices. Undefined while loading, null on an error.
 */
export function useAdminPlans() {
  const [plans, setPlans] = useState<AdminPlan[] | null>();

  const reload = useCallback(() => {
    api
      .get<AdminPlan[]>("/admin/plans")
      .then((res) => setPlans(res.data))
      .catch(() => setPlans(null));
  }, []);

  useEffect(reload, [reload]);

  return { plans, setPlans, reload };
}

/** «Витрина + ИИ · 1 000 ₽» — a plan in a picker. */
export function planLabel(plan: Pick<AdminPlan, "name" | "price">) {
  return plan.price != null ? `${plan.name} · ${plan.price.toLocaleString("ru-RU")} ₽` : plan.name;
}
