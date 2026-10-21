import { DatabaseRestoreIcon, Download01Icon } from "@hugeicons/core-free-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import { Badge, Button, Card, CardHeader, Notice, ProgressBar, useToast } from "../../ui";
import styles from "./BackupCard.module.css";

interface BackupRun {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: "RUNNING" | "OK" | "FAILED";
  target: string;
  databaseBytes: number | null;
  uploadedFiles: number | null;
  error: string | null;
}

type BackupStage = "snapshot" | "verify" | "compress" | "save" | "uploadDatabase" | "uploadPhotos" | "pruneRemote";

/** Where the running copy is now: step of steps, and inside the step — database pages or photos, when counted. */
interface BackupProgress {
  stage: BackupStage;
  step: number;
  steps: number;
  done: number | null;
  total: number | null;
}

interface BackupsResponse {
  settings: { enabled: boolean; storage: string | null; hour: number; keepLocal: number; keepRemoteDays: number };
  runs: BackupRun[];
  progress: BackupProgress | null;
}

const stageLabels: Record<BackupStage, string> = {
  snapshot: "Снимаю копию базы",
  verify: "Проверяю, что копия открывается",
  compress: "Сжимаю копию",
  save: "Сохраняю на сервере",
  uploadDatabase: "Отправляю базу в хранилище",
  uploadPhotos: "Отправляю новые фото в хранилище",
  pruneRemote: "Удаляю старые копии из хранилища"
};

/** The whole copy in percent: finished steps plus the share of the current one. */
function percent(progress: BackupProgress) {
  const inside = progress.total ? (progress.done ?? 0) / progress.total : 0;
  return ((progress.step - 1 + inside) / progress.steps) * 100;
}

const timeFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

function size(bytes: number | null) {
  if (bytes == null) return "";
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} МБ` : `${Math.max(1, Math.round(bytes / 1024))} КБ`;
}

/** Are the data safe: when the last copy was made, where it went, and a way to make one now. */
export function BackupCard() {
  const toast = useToast();
  const [data, setData] = useState<BackupsResponse>();
  const [isStarting, setIsStarting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const poll = useRef<number | undefined>(undefined);
  const wasRunning = useRef(false);

  const load = useCallback(() => {
    api
      .get<BackupsResponse>("/admin/backups")
      .then((res) => {
        setData(res.data);
        const isRunning = res.data.runs[0]?.status === "RUNNING";
        if (wasRunning.current && res.data.runs[0]?.status === "OK") toast.show("Копия готова", { tone: "success" });
        wasRunning.current = isRunning;
        // While a copy is being made, follow its steps.
        window.clearTimeout(poll.current);
        if (isRunning) poll.current = window.setTimeout(load, 1000);
      })
      .catch(() => undefined);
  }, [toast]);

  useEffect(() => {
    load();
    return () => window.clearTimeout(poll.current);
  }, [load]);

  async function startNow() {
    setIsStarting(true);
    try {
      await api.post("/admin/backups");
      // A small database is copied before the first check: still say it's done.
      wasRunning.current = true;
      window.setTimeout(load, 300);
    } catch {
      toast.show("Не удалось запустить копирование", { tone: "danger" });
    } finally {
      setIsStarting(false);
    }
  }

  /** A fresh copy of the database straight to this computer (the photos aren't in it). */
  async function download() {
    setIsDownloading(true);
    try {
      const response = await api.get<Blob>("/admin/backups/download", { responseType: "blob" });
      const name = /filename="([^"]+)"/.exec(String(response.headers["content-disposition"] ?? ""))?.[1] ?? "database.sqlite.gz";
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.show("Копия базы сохранена в загрузки", { tone: "success" });
    } catch {
      toast.show("Не удалось скачать копию базы", { tone: "danger" });
    } finally {
      setIsDownloading(false);
    }
  }

  if (!data) return null;
  const { settings, runs, progress } = data;
  const lastOk = runs.find((run) => run.status === "OK");
  const latest = runs[0];
  // The nightly copy plus a couple of hours of slack.
  const isStale = !lastOk || Date.now() - Date.parse(lastOk.finishedAt ?? lastOk.startedAt) > 26 * 60 * 60 * 1000;

  return (
    <Card as="section" padding="lg" className={styles.card}>
      <CardHeader
        title="Резервные копии"
        description={`Каждый день в ${String(settings.hour).padStart(2, "0")}:00: база и новые фото`}
        actions={
          <>
            <Button variant="secondary" size="sm" icon={DatabaseRestoreIcon} loading={isStarting || latest?.status === "RUNNING"} onClick={startNow}>
              Сделать копию сейчас
            </Button>
            <Button variant="outline" size="sm" icon={Download01Icon} loading={isDownloading} onClick={download} title="Свежая копия базы: магазины, товары, владельцы, оплаты. Фото в неё не входят">
              Скачать на компьютер
            </Button>
          </>
        }
      />
      {latest?.status === "RUNNING" && (
        <div className={styles.progress}>
          <div className={styles.progressText}>
            <span>{progress ? `Шаг ${progress.step} из ${progress.steps}: ${stageLabels[progress.stage]}` : "Копия делается…"}</span>
            {progress?.stage === "uploadPhotos" && progress.total != null && (
              <span>
                {progress.done} из {progress.total} фото
              </span>
            )}
          </div>
          <ProgressBar value={progress ? percent(progress) : 0} label="Ход копирования" />
        </div>
      )}
      <div className={styles.status}>
        {lastOk ? (
          <span>
            Последняя копия: <strong>{timeFormat.format(new Date(lastOk.finishedAt ?? lastOk.startedAt))}</strong>, база {size(lastOk.databaseBytes)}
            {lastOk.uploadedFiles ? `, отправлено новых фото: ${lastOk.uploadedFiles}` : ""}
          </span>
        ) : (
          <span>Копий ещё не было.</span>
        )}
        <Badge tone={settings.storage ? "success" : "warning"}>{settings.storage ? "Сервер + хранилище S3" : "Только на сервере"}</Badge>
      </div>
      {latest?.status === "FAILED" && (
        <Notice tone="danger" title="Последняя копия не получилась">
          {latest.error}. Сообщение ушло в Telegram, если он настроен.
        </Notice>
      )}
      {latest?.status !== "FAILED" && lastOk && isStale && (
        <Notice tone="warning" title="Копия старше суток">
          Проверьте, что сервер работает, или нажмите «Сделать копию сейчас».
        </Notice>
      )}
      {!settings.storage && (
        <Notice tone="warning" title="Копии лежат на том же сервере">
          Если сервер сломается, пропадут и данные, и копии. Подключите объектное хранилище (Yandex Object Storage, Timeweb и т. п.): параметры BACKUP_S3_* в .env.
        </Notice>
      )}
    </Card>
  );
}
