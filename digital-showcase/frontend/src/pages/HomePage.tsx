import { Link } from "react-router-dom";

export function HomePage() {
  return (
    <section className="page page-landing">
      <div className="landing-hero-text">
        <p className="landing-eyebrow">Цифровые витрины для локальных магазинов одежды</p>
        <h1>Показывайте ассортимент без интернет-магазина</h1>
        <p className="landing-lead">
          Публичная ссылка магазина, карточки товаров, контакты и наличие. Без корзины, заказов и онлайн-оплаты.
        </p>
        <Link to="/login" className="btn btn-primary btn-lg">
          Войти
        </Link>
      </div>
    </section>
  );
}
