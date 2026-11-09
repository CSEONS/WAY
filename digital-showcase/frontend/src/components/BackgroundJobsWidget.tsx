import { Cancel01Icon, CancelCircleIcon, CheckmarkCircle02Icon, Clock01Icon } from "@hugeicons/core-free-icons";
import { type BulkSortingJob, useBackgroundJobs } from "../state/backgroundJobs";
import { Button, ButtonLink, Icon, IconButton, ProgressBar, Spinner, cx } from "../ui";
import { plural } from "../utils/format";
import styles from "./BackgroundJobsWidget.module.css";

const productWords: [string, string, string] = ["товар", "товара", "товаров"];

/** «Добавить много товаров» the owner left to the AI: how it's going, then «Продолжить». */
function SortingCard({ sorting, onDismiss }: { sorting: BulkSortingJob; onDismiss: () => void }) {
  const link = `/dashboard/stores/${sorting.storeId}/products/bulk?draft=${sorting.draftId}`;
  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <strong className={styles.title}>{sorting.status === "DONE" ? "Фото разложены" : "Раскладка фото"}</strong>
        <IconButton icon={Cancel01Icon} label="Скрыть" size="sm" onClick={onDismiss} />
      </div>
      {sorting.status === "RUNNING" && (
        <p className={styles.message}>
          <Spinner size="sm" />
          ИИ раскладывает {sorting.photoCount} фото. Пришлём уведомление, когда закончит.
        </p>
      )}
      {sorting.status === "DONE" && (
        <>
          <p className={cx(styles.message, styles.success)}>
            <Icon icon={CheckmarkCircle02Icon} size="xs" />
            {sorting.productCount} {plural(sorting.productCount, productWords)} — проверьте раскладку и поставьте цены
          </p>
          <ButtonLink variant="primary" size="sm" to={link}>
            Продолжить
          </ButtonLink>
        </>
      )}
      {sorting.status === "ERROR" && (
        <>
          <p className={cx(styles.message, styles.error)}>
            <Icon icon={CancelCircleIcon} size="xs" />
            {sorting.error ?? "Не удалось разложить фото"}
          </p>
          <ButtonLink variant="secondary" size="sm" to={link}>
            Открыть
          </ButtonLink>
        </>
      )}
    </div>
  );
}

export function BackgroundJobsWidget() {
  const { jobs, dismissJob, retryJob, sortings, dismissBulkSorting } = useBackgroundJobs();
  if (!jobs.length && !sortings.length) return null;

  // Bulk adding queues many products: one line for those still waiting, not a card each.
  const waiting = jobs.filter((job) => job.status === "waiting");
  const shown = jobs.filter((job) => job.status !== "waiting");

  return (
    <div className={styles.dock} role="status" aria-live="polite">
      {sortings.map((sorting) => (
        <SortingCard key={sorting.draftId} sorting={sorting} onDismiss={() => dismissBulkSorting(sorting.draftId)} />
      ))}
      {shown.map((job) => (
        <div className={styles.card} key={job.id}>
          <div className={styles.head}>
            <strong className={styles.title}>{job.title}</strong>
            <IconButton icon={Cancel01Icon} label="Скрыть" size="sm" onClick={() => dismissJob(job.id)} />
          </div>
          {job.status === "running" && (
            <>
              <ProgressBar value={job.percent} label={job.title} />
              <p className={styles.message}>
                {job.message} · {job.percent}%
              </p>
            </>
          )}
          {job.status === "done" && (
            <p className={cx(styles.message, styles.success)}>
              <Icon icon={CheckmarkCircle02Icon} size="xs" />
              {job.message}
            </p>
          )}
          {job.status === "error" && (
            <>
              <p className={cx(styles.message, styles.error)}>
                <Icon icon={CancelCircleIcon} size="xs" />
                {job.message}
              </p>
              <Button variant="secondary" size="sm" onClick={() => retryJob(job.id)}>
                Повторить
              </Button>
            </>
          )}
        </div>
      ))}
      {waiting.length > 0 && (
        <div className={cx(styles.card, styles.waiting)}>
          <Icon icon={Clock01Icon} size="sm" />
          В очереди: ещё {waiting.length} {plural(waiting.length, productWords)}
        </div>
      )}
    </div>
  );
}
