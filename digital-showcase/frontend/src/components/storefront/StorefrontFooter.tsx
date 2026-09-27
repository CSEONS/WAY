import { Link } from "react-router-dom";
import styles from "./StorefrontFooter.module.css";

/** Bottom of a storefront: prices on a catalog aren't a sales offer; the service's policy. */
export function StorefrontFooter() {
  return (
    <footer className={styles.footer}>
      <span>Цены и наличие уточняйте у продавца: информация на витрине не является публичной офертой.</span>
      <Link to="/privacy">Политика конфиденциальности</Link>
    </footer>
  );
}
