import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, CancelCircleIcon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { useBackgroundJobs } from "../state/backgroundJobs";

export function BackgroundJobsWidget() {
  const { jobs, dismissJob } = useBackgroundJobs();
  if (!jobs.length) return null;

  return (
    <div className="background-jobs-dock" role="status" aria-live="polite">
      {jobs.map((job) => (
        <div className={`background-job-card is-${job.status}`} key={job.id}>
          <div className="background-job-card-head">
            <strong>{job.title}</strong>
            <button type="button" className="btn-icon btn-ghost" aria-label="Скрыть" onClick={() => dismissJob(job.id)}>
              <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.8} />
            </button>
          </div>
          {job.status === "running" && (
            <>
              <div className="background-job-progress">
                <div className="background-job-progress-fill" style={{ width: `${job.percent}%` }} />
              </div>
              <p className="background-job-message">
                {job.message} · {job.percent}%
              </p>
            </>
          )}
          {job.status === "done" && (
            <p className="background-job-message is-success">
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} strokeWidth={1.8} />
              Товар сохранён
            </p>
          )}
          {job.status === "error" && (
            <p className="background-job-message is-error">
              <HugeiconsIcon icon={CancelCircleIcon} size={14} strokeWidth={1.8} />
              {job.message}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
