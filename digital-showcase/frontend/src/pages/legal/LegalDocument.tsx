import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useDocumentMeta } from "../../hooks/useDocumentMeta";
import { useSiteSettings } from "../../state/siteSettings";
import type { Legal } from "../../types/models";
import { ErrorState, LoadingState, Notice, Page } from "../../ui";
import styles from "./Legal.module.css";

const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });

/** A value from «Реквизиты» in the admin panel, or a highlighted gap to fill in. */
export function Value({ value, placeholder }: { value: string; placeholder: string }) {
  return value ? <>{value}</> : <mark className={styles.gap}>[{placeholder}]</mark>;
}

export function Operator({ legal }: { legal: Legal }) {
  return (
    <>
      <Value value={legal.operator} placeholder="ФИО или название" />, ИНН <Value value={legal.inn} placeholder="ИНН" />
      {legal.ogrn && `, ОГРН(ИП) ${legal.ogrn}`}
    </>
  );
}

function isLegalFilled(legal: Legal) {
  return Boolean(legal.operator && legal.inn && legal.email);
}

export function Site() {
  return <>{window.location.origin}</>;
}

/** Page shell for the privacy policy and the offer; the text gets the requisites from «Реквизиты» in the admin panel. */
export function LegalDocument({ title, children }: { title: string; children: (legal: Legal) => ReactNode }) {
  useDocumentMeta(title);
  const site = useSiteSettings();
  if (!site) {
    return <Page width="narrow">{site === null ? <ErrorState onRetry={() => window.location.reload()} /> : <LoadingState />}</Page>;
  }
  const { legal } = site;
  return (
    <Page width="narrow">
      <article className={styles.document}>
        <h1>{title}</h1>
        <p className={styles.meta}>Редакция от {dateFormat.format(new Date(legal.updatedAt))}</p>
        {!isLegalFilled(legal) && (
          <Notice tone="warning" title="Шаблон документа">
            Реквизиты ещё не заполнены (админка → «Реквизиты»), а текст стоит согласовать с юристом.
          </Notice>
        )}
        {children(legal)}
        <footer className={styles.footer}>
          <Link to="/privacy">Политика конфиденциальности</Link>
          <Link to="/offer">Оферта</Link>
          <Link to="/">На главную</Link>
        </footer>
      </article>
    </Page>
  );
}
