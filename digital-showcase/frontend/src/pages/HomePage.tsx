import { Page, ButtonLink } from "../ui";
import styles from "./HomePage.module.css";

export function HomePage() {
  return (
    <Page className={styles.page}>
      <div className={styles.hero}>
        <p className={styles.eyebrow}>Цифровые витрины для локальных магазинов одежды</p>
        <h1 className={styles.title}>Показывайте ассортимент без интернет-магазина</h1>
        <p className={styles.lead}>Публичная ссылка магазина, карточки товаров, контакты и наличие. Без корзины, заказов и онлайн-оплаты.</p>
        <ButtonLink to="/login" variant="primary" size="lg" className={styles.cta}>
          Войти
        </ButtonLink>
      </div>
    </Page>
  );
}
