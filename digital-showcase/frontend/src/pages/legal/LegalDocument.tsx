import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useDocumentMeta } from "../../hooks/useDocumentMeta";
import { Notice, Page } from "../../ui";
import { LEGAL, isLegalFilled } from "./config";
import styles from "./Legal.module.css";

const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });

/** A value from config.ts, or a highlighted gap to fill in. */
export function Value({ value, placeholder }: { value: string; placeholder: string }) {
  return value ? <>{value}</> : <mark className={styles.gap}>[{placeholder}]</mark>;
}

export function Operator() {
  return (
    <>
      <Value value={LEGAL.operator} placeholder="ФИО или название" />, ИНН <Value value={LEGAL.inn} placeholder="ИНН" />
      {LEGAL.ogrn && `, ОГРН(ИП) ${LEGAL.ogrn}`}
    </>
  );
}

export function Site() {
  return <>{window.location.origin}</>;
}

/** Page shell for the privacy policy and the offer. */
export function LegalDocument({ title, children }: { title: string; children: ReactNode }) {
  useDocumentMeta(title);
  return (
    <Page width="narrow">
      <article className={styles.document}>
        <h1>{title}</h1>
        <p className={styles.meta}>Редакция от {dateFormat.format(new Date(LEGAL.updatedAt))}</p>
        {!isLegalFilled() && (
          <Notice tone="warning" title="Шаблон документа">
            Реквизиты ещё не заполнены (frontend/src/pages/legal/config.ts), а текст стоит согласовать с юристом.
          </Notice>
        )}
        {children}
        <footer className={styles.footer}>
          <Link to="/privacy">Политика конфиденциальности</Link>
          <Link to="/offer">Оферта</Link>
          <Link to="/">На главную</Link>
        </footer>
      </article>
    </Page>
  );
}
