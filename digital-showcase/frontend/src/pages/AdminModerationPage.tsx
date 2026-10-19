import { CheckmarkCircle02Icon, PackageRemoveIcon, Undo02Icon, ViewOffSlashIcon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import { api, imageUrl } from "../api/client";
import type { BlockedProduct, ImageCheck, ModerationStatus } from "../types/models";
import { formatDate } from "../utils/format";
import { Badge, Button, Card, ConfirmModal, EmptyState, ErrorState, LoadingState, Page, PageHeader, SegmentedControl, useToast } from "../ui";
import styles from "./AdminModerationPage.module.css";

type Filter = ModerationStatus | "BLOCKED";
type Decision = "APPROVED" | "REJECTED" | "PRODUCT_BLOCKED";

const filters: { value: Filter; label: string }[] = [
  { value: "PENDING", label: "На проверке" },
  { value: "REJECTED", label: "Скрытые" },
  { value: "APPROVED", label: "Показанные" },
  { value: "BLOCKED", label: "Снятые товары" }
];

const emptyText: Record<Filter, string> = {
  PENDING: "Новых фото с людьми или животными нет.",
  REJECTED: "Скрытых фото нет.",
  APPROVED: "Показанных после проверки фото нет.",
  BLOCKED: "Снятых с витрины товаров нет."
};

const done: Record<Decision, string> = {
  APPROVED: "Фото показывается покупателям",
  REJECTED: "Фото скрыто, товар остаётся на витрине",
  PRODUCT_BLOCKED: "Товар снят с витрины"
};

/**
 * «Проверка фото»: photos and logos where the AI found faces of people or
 * animals. Buyers see them until a decision: «Показывать» — it was a mistake
 * or it's allowed; «Скрыть фото» — only this photo goes; «Снять товар» — the
 * whole product leaves the storefront. The owner is notified of each decision;
 * «Снятые товары» puts a product back once the owner fixed it.
 * The admin moderates for now; the API has its own guard for a future moderator role.
 */
export function AdminModerationPage() {
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("PENDING");
  const [checks, setChecks] = useState<ImageCheck[]>();
  const [blocked, setBlocked] = useState<BlockedProduct[]>();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toBlock, setToBlock] = useState<ImageCheck | null>(null);

  function load() {
    setState("loading");
    const request =
      filter === "BLOCKED"
        ? api.get<BlockedProduct[]>("/moderation/products/blocked").then((res) => setBlocked(res.data))
        : api.get<ImageCheck[]>("/moderation/images", { params: { status: filter } }).then((res) => setChecks(res.data));
    request.then(() => setState("ready")).catch(() => setState("error"));
  }

  useEffect(load, [filter]);

  async function decide(check: ImageCheck, decision: Decision) {
    setBusyId(check.id);
    try {
      await api.patch(`/moderation/images/${check.id}`, { status: decision });
      setChecks((current) => current?.filter((item) => item.id !== check.id));
      toast.show(done[decision], { tone: "success" });
    } catch (err: any) {
      toast.show(err?.response?.data?.message ?? "Не удалось сохранить решение", { tone: "danger" });
    } finally {
      setBusyId(null);
      setToBlock(null);
    }
  }

  async function unblock(product: BlockedProduct) {
    setBusyId(product.id);
    try {
      await api.post(`/moderation/products/${product.id}/unblock`);
      setBlocked((current) => current?.filter((item) => item.id !== product.id));
      toast.show("Товар снова на витрине", { tone: "success" });
    } catch (err: any) {
      toast.show(err?.response?.data?.message ?? "Не удалось вернуть товар", { tone: "danger" });
    } finally {
      setBusyId(null);
    }
  }

  const isEmpty = filter === "BLOCKED" ? !blocked?.length : !checks?.length;

  return (
    <Page>
      <PageHeader
        title="Проверка фото"
        description="ИИ нашёл на фото лица людей или животных. Покупатели видят их, пока вы не решите; владелец получает уведомление о каждом решении"
        back={{ to: "/admin", label: "В админку" }}
      />
      <SegmentedControl label="Какие фото показать" value={filter} onChange={setFilter} options={filters} />

      {state === "error" && <ErrorState onRetry={load} />}
      {state === "loading" && <LoadingState />}
      {state === "ready" && isEmpty && <EmptyState title="Пусто" description={emptyText[filter]} />}

      {state === "ready" && filter !== "BLOCKED" && checks && checks.length > 0 && (
        <div className={styles.grid}>
          {checks.map((check) => {
            const isProduct = check.kind === "PRODUCT";
            const isBlocked = Boolean(check.productBlocked);
            const busy = busyId === check.id;
            return (
              <Card key={check.id} padding="md" className={styles.card}>
                <a href={imageUrl(check.url)} target="_blank" rel="noreferrer" className={styles.photo}>
                  <img src={imageUrl(check.url)} alt={check.findings} loading="lazy" />
                </a>
                <div className={styles.text}>
                  <strong>{check.findings || "Живые существа"}</strong>
                  <small>
                    {isProduct ? check.productTitle ?? "Товар" : "Логотип"} ·{" "}
                    <a href={`/m/${check.storeSlug}`} target="_blank" rel="noreferrer">
                      {check.storeName}
                    </a>
                  </small>
                  <small>
                    {formatDate(check.createdAt)}
                    {check.reviewedAt ? ` · решение ${formatDate(check.reviewedAt)}` : ""}
                  </small>
                </div>
                {check.status === "PENDING" && <Badge tone="warning">Покупатели пока видят</Badge>}
                {isBlocked && <Badge tone="danger">Товар снят с витрины</Badge>}
                <div className={styles.actions}>
                  {check.status !== "APPROVED" && (
                    <Button variant="secondary" size="sm" icon={CheckmarkCircle02Icon} loading={busy} onClick={() => decide(check, "APPROVED")}>
                      {isBlocked ? "Показывать и вернуть товар" : "Показывать"}
                    </Button>
                  )}
                  {check.status !== "REJECTED" && (
                    <Button variant="outline" size="sm" icon={ViewOffSlashIcon} loading={busy} onClick={() => decide(check, "REJECTED")}>
                      {isProduct ? "Скрыть фото" : "Скрыть логотип"}
                    </Button>
                  )}
                  {isProduct && !isBlocked && (
                    <Button variant="danger" size="sm" icon={PackageRemoveIcon} loading={busy} onClick={() => setToBlock(check)}>
                      Снять товар
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {state === "ready" && filter === "BLOCKED" && blocked && blocked.length > 0 && (
        <div className={styles.grid}>
          {blocked.map((product) => (
            <Card key={product.id} padding="md" className={styles.card}>
              {product.imageUrl && (
                <a href={imageUrl(product.imageUrl)} target="_blank" rel="noreferrer" className={styles.photo}>
                  <img src={imageUrl(product.imageUrl)} alt={product.title} loading="lazy" />
                </a>
              )}
              <div className={styles.text}>
                <strong>{product.title}</strong>
                <small>
                  <a href={`/m/${product.storeSlug}`} target="_blank" rel="noreferrer">
                    {product.storeName}
                  </a>{" "}
                  · снят {formatDate(product.blockedAt)}
                </small>
                {product.blockedReason && <span className={styles.reason}>{product.blockedReason}</span>}
              </div>
              <div className={styles.actions}>
                <Button variant="secondary" size="sm" icon={Undo02Icon} loading={busyId === product.id} onClick={() => unblock(product)}>
                  Вернуть на витрину
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {toBlock && (
        <ConfirmModal
          danger
          title="Снять товар с витрины?"
          description={`Товар «${toBlock.productTitle ?? "без названия"}» перестанут видеть покупатели, владелец получит уведомление с причиной. Вернуть товар можно во вкладке «Снятые товары».`}
          confirmLabel="Снять товар"
          onCancel={() => setToBlock(null)}
          onConfirm={() => decide(toBlock, "PRODUCT_BLOCKED")}
        />
      )}
    </Page>
  );
}
