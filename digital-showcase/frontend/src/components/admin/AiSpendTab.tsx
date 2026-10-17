import { AiMagicIcon, Coins01Icon, Image01Icon, Money03Icon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { AiSpend, AiSpendReport } from "../../types/models";
import { ButtonLink, Card, CardHeader, ErrorState, LoadingState, Notice, Stat } from "../../ui";
import { formatMoney, formatMonth, plural } from "../../utils/format";
import styles from "./AiSpendTab.module.css";

function rubles(value: number | null) {
  return value == null ? "—" : `≈${formatMoney(value)}`;
}

/**
 * «Расходы на ИИ» in the admin panel: this month at a glance (from the
 * overview), the last six months and this month by store — to compare with
 * what the AI plan brings in.
 */
export function AiSpendTab({ summary }: { summary: AiSpend }) {
  const [report, setReport] = useState<AiSpendReport>();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  function load() {
    setState("loading");
    api
      .get<AiSpendReport>("/admin/ai/spend")
      .then((res) => {
        setReport(res.data);
        setState("ready");
      })
      .catch(() => setState("error"));
  }

  useEffect(load, []);

  return (
    <>
      {summary.rubPerUsd == null && (
        <Notice
          title="Сколько стоит ИИ в рублях"
          action={
            <ButtonLink variant="secondary" size="sm" to="/admin/settings">
              Указать курс
            </ButtonLink>
          }
        >
          Укажите в «Настройках ИИ», сколько рублей вы платите за $1 (курс плюс комиссия посредника, если платите через него). Пока его нет, здесь только
          количество карточек и превью.
        </Notice>
      )}

      <div className={styles.stats}>
        <Stat
          icon={Money03Icon}
          label="За этот месяц"
          value={rubles(summary.costRub)}
          hint={`${summary.cards} ${plural(summary.cards, ["карточка", "карточки", "карточек"])} · ${summary.previews} превью`}
        />
        <Stat icon={AiMagicIcon} label="Карточка в среднем" value={rubles(summary.cardRub)} hint="Черновик или товар из пачки" />
        <Stat
          icon={Image01Icon}
          label="Превью в среднем"
          value={rubles(summary.previewRub)}
          hint={summary.previewMaxRub != null ? `Дороже всего ≈${formatMoney(summary.previewMaxRub)}` : "В этом месяце не было"}
        />
        <Stat
          icon={Coins01Icon}
          label="Курс"
          value={summary.rubPerUsd != null ? `${formatMoney(summary.rubPerUsd)} за $1` : "—"}
          hint="Меняется в «Настройках ИИ»"
        />
      </div>

      {summary.unpricedModels.length > 0 && (
        <Notice tone="warning" title="Цена модели неизвестна">
          {summary.unpricedModels.join(", ")} — эти запросы не вошли в суммы. Цены моделей — в backend/src/services/aiPrices.ts.
        </Notice>
      )}

      {state === "error" && <ErrorState onRetry={load} />}
      {state === "loading" && <LoadingState />}
      {state === "ready" && report && (
        <>
          <Card as="section" padding="lg" className={styles.section}>
            <CardHeader title="Магазины в этом месяце" description="Сколько ИИ израсходовал каждый магазин — сначала самые дорогие" />
            {report.stores.length ? (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Магазин</th>
                      <th>ИИ из лимита</th>
                      <th>Превью</th>
                      <th>Расход</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.stores.map((store) => (
                      <tr key={store.storeId}>
                        <td>{store.name}</td>
                        <td className={store.used >= store.limit ? styles.over : undefined}>
                          {store.used} из {store.limit}
                        </td>
                        <td>{store.previews}</td>
                        <td>{rubles(store.costRub)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className={styles.muted}>В этом месяце ИИ ещё не использовали.</p>
            )}
          </Card>

          <Card as="section" padding="lg" className={styles.section}>
            <CardHeader title="По месяцам" description="Последние полгода" />
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Месяц</th>
                    <th>Карточек</th>
                    <th>Превью</th>
                    <th>Расход</th>
                  </tr>
                </thead>
                <tbody>
                  {[...report.months].reverse().map((month) => (
                    <tr key={month.month}>
                      <td>{formatMonth(month.month)}</td>
                      <td>{month.cards}</td>
                      <td>{month.previews}</td>
                      <td>{month.cards || month.previews ? rubles(month.costRub) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
