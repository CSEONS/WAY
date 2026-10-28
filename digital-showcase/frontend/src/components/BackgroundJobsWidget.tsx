import { Cancel01Icon, CancelCircleIcon, CheckmarkCircle02Icon, Clock01Icon } from "@hugeicons/core-free-icons";
import { useBackgroundJobs } from "../state/backgroundJobs";
import { Button, Icon, IconButton, ProgressBar, cx } from "../ui";
import { plural } from "../utils/format";
import styles from "./BackgroundJobsWidget.module.css";

export function BackgroundJobsWidget() {
  const { jobs, dismissJob, retryJob } = useBackgroundJobs();
  if (!jobs.length) return null;

  // Bulk adding queues many products: one line for those still waiting, not a card each.
  const waiting = jobs.filter((job) => job.status === "waiting");
  const shown = jobs.filter((job) => job.status !== "waiting");

  return (
    <div className={styles.dock} role="status" aria-live="polite">
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
          В очереди: ещё {waiting.length} {plural(waiting.length, ["товар", "товара", "товаров"])}
        </div>
      )}
    </div>
  );
}
