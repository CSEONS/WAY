import { TShirtIcon, WhatsappIcon } from "@hugeicons/core-free-icons";
import { Icon, cx } from "../../ui";
import styles from "./PhoneMock.module.css";

const tiles = [
  { title: "Платье миди", price: "4 900 ₽", tone: styles.toneAccent, badge: "Новинка" },
  { title: "Джинсы прямые", price: "3 200 ₽", tone: styles.toneSuccess },
  { title: "Рубашка лён", price: "2 800 ₽", tone: styles.toneWarning },
  { title: "Кардиган", price: "от 3 500 ₽", tone: styles.toneDanger }
];

/** A storefront on a phone, drawn with the kit's colors — the hero picture of the landing page. */
export function PhoneMock({ className }: { className?: string }) {
  return (
    <div className={cx(styles.phone, className)} role="img" aria-label="Пример витрины магазина на телефоне">
      <div className={styles.screen} aria-hidden="true">
        <div className={styles.store}>
          <span className={styles.logo}>М</span>
          <span className={styles.storeText}>
            <strong>Магазин одежды</strong>
            <small>ул. Ленина, 12 · 10:00–20:00</small>
          </span>
        </div>
        <div className={styles.chips}>
          <span className={cx(styles.chip, styles.chipActive)}>Все</span>
          <span className={styles.chip}>Платья</span>
          <span className={styles.chip}>Джинсы</span>
          <span className={styles.chip}>Рубашки</span>
        </div>
        <div className={styles.grid}>
          {tiles.map((tile) => (
            <div key={tile.title} className={styles.tile}>
              <div className={cx(styles.photo, tile.tone)}>
                {tile.badge && <span className={styles.badge}>{tile.badge}</span>}
                <Icon icon={TShirtIcon} size="lg" strokeWidth={1.4} />
              </div>
              <strong>{tile.title}</strong>
              <small>{tile.price}</small>
            </div>
          ))}
        </div>
        <div className={styles.whatsapp}>
          <Icon icon={WhatsappIcon} size="sm" />
          Написать в WhatsApp
        </div>
      </div>
    </div>
  );
}
