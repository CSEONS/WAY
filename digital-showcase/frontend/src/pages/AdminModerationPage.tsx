import { CheckmarkCircle02Icon, ViewOffSlashIcon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import { api, imageUrl } from "../api/client";
import type { ImageCheck, ModerationStatus } from "../types/models";
import { formatDate } from "../utils/format";
import { Badge, Button, Card, EmptyState, ErrorState, LoadingState, Page, PageHeader, SegmentedControl, useToast } from "../ui";
import styles from "./AdminModerationPage.module.css";

const filters: { value: ModerationStatus; label: string }[] = [
  { value: "PENDING", label: "На проверке" },
  { value: "REJECTED", label: "Скрытые" },
  { value: "APPROVED", label: "Показанные" }
];

const emptyText: Record<ModerationStatus, string> = {
  PENDING: "Новых фото с людьми или животными нет.",
  REJECTED: "Скрытых фото нет.",
  APPROVED: "Показанных после проверки фото нет."
};

/**
 * «Проверка фото»: photos and logos where the AI found people or animals.
 * Buyers don't see them until a decision: «Показывать» — it was a mistake or
 * it's allowed, «Скрыть» — stays hidden, the owner sees «Скрыто».
 * The admin moderates for now; the API has its own guard for a future moderator role.
 */
export function AdminModerationPage() {
  const toast = useToast();
  const [status, setStatus] = useState<ModerationStatus>("PENDING");
  const [checks, setChecks] = useState<ImageCheck[]>();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    setState("loading");
    api
      .get<ImageCheck[]>("/moderation/images", { params: { status } })
      .then((res) => {
        setChecks(res.data);
        setState("ready");
      })
      .catch(() => setState("error"));
  }

  useEffect(load, [status]);

  async function decide(check: ImageCheck, decision: "APPROVED" | "REJECTED") {
    setBusyId(check.id);
    try {
      await api.patch(`/moderation/images/${check.id}`, { status: decision });
      setChecks((current) => current?.filter((item) => item.id !== check.id));
      toast.show(decision === "APPROVED" ? "Фото показывается покупателям" : "Фото скрыто от покупателей", { tone: "success" });
    } catch {
      toast.show("Не удалось сохранить решение", { tone: "danger" });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Page>
      <PageHeader
        title="Проверка фото"
        description="ИИ нашёл на фото лица людей или животных. Пока вы не решите, покупатели их не видят"
        back={{ to: "/admin", label: "В админку" }}
      />
      <SegmentedControl label="Какие фото показать" value={status} onChange={setStatus} options={filters} />

      {state === "error" && <ErrorState onRetry={load} />}
      {state === "loading" && <LoadingState />}
      {state === "ready" && checks && !checks.length && <EmptyState title="Пусто" description={emptyText[status]} />}
      {state === "ready" && checks && checks.length > 0 && (
        <div className={styles.grid}>
          {checks.map((check) => (
            <Card key={check.id} padding="md" className={styles.card}>
              <a href={imageUrl(check.url)} target="_blank" rel="noreferrer" className={styles.photo}>
                <img src={imageUrl(check.url)} alt={check.findings} loading="lazy" />
              </a>
              <div className={styles.text}>
                <strong>{check.findings || "Живые существа"}</strong>
                <small>
                  {check.kind === "LOGO" ? "Логотип" : check.productTitle ?? "Товар"} ·{" "}
                  <a href={`/m/${check.storeSlug}`} target="_blank" rel="noreferrer">
                    {check.storeName}
                  </a>
                </small>
                <small>
                  {formatDate(check.createdAt)}
                  {check.reviewedAt ? ` · решение ${formatDate(check.reviewedAt)}` : ""}
                </small>
              </div>
              {check.status === "PENDING" && <Badge tone="warning">Покупатели не видят</Badge>}
              <div className={styles.actions}>
                {check.status !== "APPROVED" && (
                  <Button variant="secondary" size="sm" icon={CheckmarkCircle02Icon} loading={busyId === check.id} onClick={() => decide(check, "APPROVED")}>
                    Показывать
                  </Button>
                )}
                {check.status !== "REJECTED" && (
                  <Button variant="outline" size="sm" icon={ViewOffSlashIcon} loading={busyId === check.id} onClick={() => decide(check, "REJECTED")}>
                    Скрыть
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </Page>
  );
}
