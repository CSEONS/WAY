import styles from "./ReceiptLink.module.css";

/** A receipt from «Мой налог» is a link; anything else (a number) is shown as text. */
export function ReceiptLink({ receipt }: { receipt: string }) {
  if (/^https?:\/\//i.test(receipt)) {
    return (
      <a className={styles.link} href={receipt} target="_blank" rel="noreferrer">
        Чек
      </a>
    );
  }
  return <span className={styles.text}>Чек {receipt}</span>;
}
