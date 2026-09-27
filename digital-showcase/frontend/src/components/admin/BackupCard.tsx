import { DatabaseRestoreIcon } from "@hugeicons/core-free-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import { Badge, Button, Card, CardHeader, Notice, useToast } from "../../ui";
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

interface BackupsResponse {
  settings: { enabled: boolean; storage: string | null; hour: number; keepLocal: number; keepRemoteDays: number };
  runs: BackupRun[];
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
  const poll = useRef<number | undefined>(undefined);

  const load = useCallback(() => {
    api
      .get<BackupsResponse>("/admin/backups")
      .then((res) => {
        setData(res.data);
        // While a copy is being made, check again shortly.
        window.clearTimeout(poll.current);
        if (res.data.runs[0]?.status === "RUNNING") poll.current = window.setTimeout(load, 3000);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
    return () => window.clearTimeout(poll.current);
  }, [load]);

  async function startNow() {
    setIsStarting(true);
    try {
      await api.post("/admin/backups");
      toast.show("Копия делается — это займёт до пары минут");
      window.setTimeout(load, 800);
    } catch {
      toast.show("Не удалось запустить копирование", { tone: "danger" });
    } finally {
      setIsStarting(false);
    }
  }

  if (!data) return null;
  const { settings, runs } = data;
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
          <Button variant="secondary" size="sm" icon={DatabaseRestoreIcon} loading={isStarting || latest?.status === "RUNNING"} onClick={startNow}>
            Сделать копию сейчас
          </Button>
        }
      />
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
