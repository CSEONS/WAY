import { AiMagicIcon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { Badge, Button, Card, CardHeader, Notice } from "../../ui";
import styles from "./AiProviderCard.module.css";

interface AiSummary {
  configured: boolean;
  host: string;
  model: string;
  style: "responses" | "chat";
  voice: string | null;
}

type Check = { ok: boolean; ms: number; message?: string } | null;

/** Where AI drafts go and whether the provider answers — handy right after switching providers in .env. */
export function AiProviderCard() {
  const [summary, setSummary] = useState<AiSummary>();
  const [check, setCheck] = useState<Check>(null);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    api
      .get<AiSummary>("/admin/ai")
      .then((res) => setSummary(res.data))
      .catch(() => undefined);
  }, []);

  async function runCheck() {
    setIsChecking(true);
    setCheck(null);
    try {
      setCheck((await api.post<NonNullable<Check>>("/admin/ai/check")).data);
    } catch {
      setCheck({ ok: false, ms: 0, message: "Сервер не ответил" });
    } finally {
      setIsChecking(false);
    }
  }

  if (!summary) return null;

  return (
    <Card as="section" padding="lg" className={styles.card}>
      <CardHeader
        title="ИИ-провайдер"
        description="Меняется в .env: AI_BASE_URL, AI_MODEL, AI_API_STYLE"
        actions={
          summary.configured && (
            <Button variant="secondary" size="sm" icon={AiMagicIcon} loading={isChecking} onClick={runCheck}>
              Проверить
            </Button>
          )
        }
      />
      {summary.configured ? (
        <dl className={styles.facts}>
          <div>
            <dt>Сервер</dt>
            <dd>{summary.host}</dd>
          </div>
          <div>
            <dt>Модель</dt>
            <dd>{summary.model}</dd>
          </div>
          <div>
            <dt>Формат</dt>
            <dd>{summary.style === "chat" ? "Chat Completions" : "Responses API"}</dd>
          </div>
          <div>
            <dt>Голос</dt>
            <dd>{summary.voice ?? "отключён"}</dd>
          </div>
        </dl>
      ) : (
        <Notice tone="warning" title="ИИ не настроен">
          Укажите AI_API_KEY в .env — без него карточки по фото и голосу не работают, остаётся простой черновик по тексту.
        </Notice>
      )}
      {check &&
        (check.ok ? (
          <Badge tone="success" className={styles.result}>
            Отвечает, {(check.ms / 1000).toFixed(1)} с
          </Badge>
        ) : (
          <Notice tone="danger" title="Провайдер не ответил как нужно">
            {check.message ?? "Ответ пришёл, но не в формате JSON. Попробуйте AI_JSON_MODE=off или другую модель."}
          </Notice>
        ))}
    </Card>
  );
}
