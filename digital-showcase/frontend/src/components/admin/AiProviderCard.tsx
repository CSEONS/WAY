import { AiMagicIcon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { AiSpend } from "../../types/models";
import { Badge, Button, ButtonLink, Card, CardHeader, Notice } from "../../ui";
import { formatMoney } from "../../utils/format";
import styles from "./AiProviderCard.module.css";

interface AiSummary {
  configured: boolean;
  host: string;
  model: string;
  style: "responses" | "chat";
  voice: string | null;
  /** Image model of «Превью с ИИ»: "host · model", or null when switched off. */
  preview: string | null;
}

type Check = { ok: boolean; ms: number; message?: string } | null;

const NOT_YET = "в этом месяце не было";

function rubles(value: number | null) {
  return value == null ? NOT_YET : `≈${formatMoney(value)}`;
}

/**
 * Where AI drafts go, whether the provider answers — handy right after
 * switching providers in .env — and what a card and a preview cost this month.
 */
export function AiProviderCard({ spend }: { spend: AiSpend }) {
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
        description="Сервер и ключ — в .env (AI_BASE_URL, AI_API_KEY), модели и курс — в «Настройках»"
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
          <div>
            <dt>Превью</dt>
            <dd>{summary.preview ?? "отключено"}</dd>
          </div>
          {spend.rubPerUsd != null && (
            <>
              <div>
                <dt>Карточка, в среднем</dt>
                <dd>{rubles(spend.cardRub)}</dd>
              </div>
              <div>
                <dt>Превью, в среднем</dt>
                <dd>{rubles(spend.previewRub)}</dd>
              </div>
              <div>
                <dt>Превью, дороже всего</dt>
                <dd>{rubles(spend.previewMaxRub)}</dd>
              </div>
              <div>
                <dt>Курс</dt>
                <dd>{formatMoney(spend.rubPerUsd)} за $1</dd>
              </div>
            </>
          )}
        </dl>
      ) : (
        <Notice tone="warning" title="ИИ не настроен">
          Укажите AI_API_KEY в .env — без него карточки по фото и голосу не работают, остаётся простой черновик по тексту.
        </Notice>
      )}
      {summary.configured && spend.rubPerUsd == null && (
        <Notice
          title="Сколько стоит ИИ в рублях"
          action={
            <ButtonLink variant="secondary" size="sm" to="/admin/settings">
              Указать курс
            </ButtonLink>
          }
        >
          Укажите в «Настройках», сколько рублей вы платите за $1 (курс плюс комиссия посредника, если платите через него). Тогда здесь будет цена одной карточки
          и одного превью.
        </Notice>
      )}
      {spend.unpricedModels.length > 0 && (
        <Notice tone="warning" title="Цена модели неизвестна">
          {spend.unpricedModels.join(", ")} — эти запросы не вошли в суммы. Цены моделей — в backend/src/services/aiPrices.ts.
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
