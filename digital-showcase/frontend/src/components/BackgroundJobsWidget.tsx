import { Cancel01Icon, CancelCircleIcon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { useBackgroundJobs } from "../state/backgroundJobs";
import { Icon, IconButton, ProgressBar, cx } from "../ui";
import styles from "./BackgroundJobsWidget.module.css";

export function BackgroundJobsWidget() {
  const { jobs, dismissJob } = useBackgroundJobs();
  if (!jobs.length) return null;

  return (
    <div className={styles.dock} role="status" aria-live="polite">
      {jobs.map((job) => (
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
              Товар сохранён
            </p>
          )}
          {job.status === "error" && (
            <p className={cx(styles.message, styles.error)}>
              <Icon icon={CancelCircleIcon} size="xs" />
              {job.message}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
