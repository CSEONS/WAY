import { Analytics01Icon, CpuIcon, Money03Icon, RefreshIcon } from "@hugeicons/core-free-icons";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../api/client";
import type { AiSpendByDay, AiSpendDay } from "../../types/models";
import { Card, CardHeader, ErrorState, IconButton, LoadingState, Notice, SegmentedControl, Stat, cx } from "../../ui";
import { formatMoney, plural } from "../../utils/format";
import styles from "./AiSpendDays.module.css";

type Period = "7" | "30" | "90";

const periods: { value: Period; label: string }[] = [
  { value: "7", label: "7 дней" },
  { value: "30", label: "30 дней" },
  { value: "90", label: "90 дней" }
];

// Days come as "2026-11-09" and are read in UTC, so a day stays itself in any time zone.
const dayShort = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });
const dayLong = new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" });
const usdFormat = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat("ru-RU");
const asDate = (date: string) => new Date(`${date}T00:00:00Z`);

function dollars(usd: number) {
  return usd > 0 && usd < 0.01 ? "< 0,01 $" : usdFormat.format(usd);
}

/** Rubles to the kopeck, «≈» — they're dollars at the rate from «Настройки ИИ». */
function rubles(rub: number) {
  return `≈${formatMoney(Math.round(rub * 100) / 100)}`;
}

/** A day's or a period's money: rubles when the rate is set, with the dollars beside them. */
function money({ usd, rub }: { usd: number; rub: number | null }) {
  return rub == null ? dollars(usd) : `${rubles(rub)} · ${dollars(usd)}`;
}

const tokensOf = (day: Pick<AiSpendDay, "inputTokens" | "outputTokens">) => day.inputTokens + day.outputTokens;

/** «37 464 токена · 33 запроса». */
function tokensAndRequests(day: AiSpendDay) {
  const tokens = tokensOf(day);
  return `${whole.format(tokens)} ${plural(tokens, ["токен", "токена", "токенов"])} · ${whole.format(day.requests)} ${plural(day.requests, ["запрос", "запроса", "запросов"])}`;
}

/** A round top for the axis at or above the dearest day: 60 for 57, 4 for 3.2 — its half is round too. */
function niceCeil(value: number) {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  return ([1, 1.2, 1.6, 2, 3, 4, 5, 6, 8, 10].find((step) => step * power >= value - 1e-9) ?? 10) * power;
}

/**
 * A column per day, the money spent that day. Hovering or focusing a column
 * shows its day, money, tokens and requests; the same numbers are in the
 * table under the chart.
 */
function SpendChart({ days, inRubles }: { days: AiSpendDay[]; inRubles: boolean }) {
  const [active, setActive] = useState<number | null>(null);
  const valueOf = (day: AiSpendDay) => (inRubles ? (day.rub ?? 0) : day.usd);
  const top = niceCeil(Math.max(...days.map(valueOf)));
  const tick = (amount: number) => (inRubles ? formatMoney(Math.round(amount * 100) / 100) : usdFormat.format(amount));
  const shown = active == null ? null : days[active];
  const middle = Math.floor((days.length - 1) / 2);

  return (
    <div className={styles.chart}>
      <div className={styles.yAxis} aria-hidden="true">
        <span className={styles.sizer}>{tick(top)}</span>
        {[1, 0.5, 0].map((share) => (
          <span key={share} className={styles.tick} style={{ bottom: `${share * 100}%` }}>
            {tick(top * share)}
          </span>
        ))}
      </div>
      <div className={styles.plotArea}>
        <div className={styles.plot} onPointerLeave={() => setActive(null)}>
          <div className={styles.gridline} style={{ bottom: "100%" }} />
          <div className={styles.gridline} style={{ bottom: "50%" }} />
          <div className={styles.bars} role="group" aria-label="Траты по дням">
            {days.map((day, index) => {
              const value = valueOf(day);
              return (
                <button
                  key={day.date}
                  type="button"
                  className={cx(styles.band, active === index && styles.bandActive)}
                  aria-label={`${dayLong.format(asDate(day.date))}: ${money(day)}, ${tokensAndRequests(day)}`}
                  onPointerEnter={() => setActive(index)}
                  onFocus={() => setActive(index)}
                  onBlur={() => setActive(null)}
                >
                  {/* A day that cost anything stays visible, however little. */}
                  <span className={styles.bar} style={{ height: value > 0 ? `max(2px, ${(value / top) * 100}%)` : 0 }} />
                </button>
              );
            })}
          </div>
          {shown && active != null && (
            <div className={styles.tooltip} style={{ left: `${Math.min(85, Math.max(15, ((active + 0.5) / days.length) * 100))}%` }} aria-hidden="true">
              <strong className={styles.tooltipValue}>{money(shown)}</strong>
              <span>{dayLong.format(asDate(shown.date))}</span>
              <span>{tokensAndRequests(shown)}</span>
            </div>
          )}
        </div>
        <div className={styles.xAxis} aria-hidden="true">
          {[0, middle, days.length - 1]
            .filter((index, position, list) => list.indexOf(index) === position)
            .map((index) => (
              <span key={index}>{dayShort.format(asDate(days[index].date))}</span>
            ))}
        </div>
      </div>
    </div>
  );
}

/**
 * «Траты по дням» on the admin panel's AI tab: how many tokens and how much
 * money the AI took over the last 7, 30 or 90 days. With an OpenAI Admin key on
 * the server these are OpenAI's own figures (as on platform.openai.com/usage);
 * without one — the site's estimate, and how to connect the key.
 */
export function AiSpendDays() {
  const [period, setPeriod] = useState<Period>("30");
  const [report, setReport] = useState<AiSpendByDay>();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback((days: Period, refresh = false) => {
    setState("loading");
    api
      .get<AiSpendByDay>("/admin/ai/spend/days", { params: { days, ...(refresh ? { refresh: 1 } : {}) } })
      .then((res) => {
        setReport(res.data);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, []);

  useEffect(() => load(period), [load, period]);

  const total = report?.total;
  const inRubles = report?.rubPerUsd != null;
  const spentDays = report ? [...report.days].reverse().filter((day) => day.usd > 0 || day.requests > 0) : [];

  return (
    <Card as="section" padding="lg" className={styles.card}>
      <CardHeader
        title="Траты на ИИ по дням"
        description={
          report?.source === "openai"
            ? "По данным OpenAI — как в platform.openai.com → Usage: все запросы организации, дни по UTC."
            : "Оценка по запросам сайта: проверка фото на лица и распознавание голоса сюда не входят."
        }
        actions={
          report?.source === "openai" && (
            <IconButton icon={RefreshIcon} label="Обновить данные OpenAI" size="sm" disabled={state === "loading"} onClick={() => load(period, true)} />
          )
        }
      />

      <SegmentedControl label="Период" size="sm" value={period} onChange={setPeriod} options={periods} className={styles.period} />

      {report && !report.adminKey && (
        <Notice tone="accent" title="Точные траты — из OpenAI">
          Чтобы видеть, сколько OpenAI списал на самом деле, создайте Admin-ключ: platform.openai.com → Settings → Organization → Admin keys. Добавьте его в .env
          сервера строкой OPENAI_ADMIN_KEY=… и перезапустите backend — данные будут браться прямо из OpenAI.
        </Notice>
      )}
      {report?.error && (
        <Notice tone="warning" title="Не удалось получить траты из OpenAI">
          {report.error.replace(/[.!]+$/, "")}. Пока показана оценка по запросам сайта.
        </Notice>
      )}
      {report && report.unpricedModels.length > 0 && (
        <Notice tone="warning">Цена не известна для {report.unpricedModels.join(", ")} — эти запросы не вошли в суммы.</Notice>
      )}

      {state === "error" && !report && <ErrorState onRetry={() => load(period)} />}
      {state === "loading" && !report && <LoadingState />}
      {report && total && (
        // Switching the period keeps the last figures, dimmed, until the new ones come.
        <div className={cx(styles.body, state === "loading" && styles.reloading)}>
          <div className={styles.stats}>
            <Stat
              icon={Money03Icon}
              label="Потрачено"
              value={total.rub != null ? rubles(total.rub) : dollars(total.usd)}
              hint={total.rub != null ? `${dollars(total.usd)} по курсу ${formatMoney(report.rubPerUsd!)} за $1` : "Укажите курс в «Настройках ИИ», чтобы видеть рубли"}
            />
            <Stat
              icon={CpuIcon}
              label="Токены"
              value={compact.format(tokensOf(total))}
              hint={`вход ${compact.format(total.inputTokens)} · ответ ${compact.format(total.outputTokens)}`}
            />
            <Stat
              icon={Analytics01Icon}
              label="Запросов"
              value={whole.format(total.requests)}
              hint={`в среднем ${money({ usd: total.usd / report.days.length, rub: total.rub == null ? null : total.rub / report.days.length })} в день`}
            />
          </div>

          <SpendChart days={report.days} inRubles={inRubles} />

          {spentDays.length ? (
            <details className={styles.details}>
              <summary className={styles.summary}>По дням: токены, запросы и деньги</summary>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>День</th>
                      <th>Токены</th>
                      <th>Вход · ответ</th>
                      <th>Запросов</th>
                      <th>Расход</th>
                    </tr>
                  </thead>
                  <tbody>
                    {spentDays.map((day) => (
                      <tr key={day.date}>
                        <td>{dayLong.format(asDate(day.date))}</td>
                        <td>{whole.format(tokensOf(day))}</td>
                        <td>
                          {whole.format(day.inputTokens)} · {whole.format(day.outputTokens)}
                        </td>
                        <td>{whole.format(day.requests)}</td>
                        <td>{money(day)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : (
            <p className={styles.muted}>За эти дни ИИ не тратил ни токенов, ни денег.</p>
          )}
        </div>
      )}
    </Card>
  );
}
