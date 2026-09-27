import {
  Analytics01Icon,
  ArrowRight01Icon,
  Call02Icon,
  Camera01Icon,
  CheckmarkCircle02Icon,
  FilterIcon,
  Link04Icon,
  Mic01Icon,
  QrCodeIcon,
  SmartPhone01Icon,
  WhatsappIcon
} from "@hugeicons/core-free-icons";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { LeadForm } from "../components/landing/LeadForm";
import { DEMO_STORE_SLUG, PLANS, SALES_CONTACTS, type Plan } from "../components/landing/config";
import { PhoneMock } from "../components/landing/PhoneMock";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { phoneUrl, whatsappUrl } from "../utils/contact";
import { Badge, Button, ButtonLink, Card, Icon, Page, cx, type IconSvgElement } from "../ui";
import styles from "./HomePage.module.css";

const steps = [
  { title: "Добавьте товары", text: "Сфотографируйте вещь, укажите цену и размеры. Описание можно надиктовать голосом — около минуты на товар." },
  { title: "Поделитесь ссылкой", text: "Поставьте её в профиль WhatsApp и Instagram, отправьте в чаты, повесьте QR-плакат на кассе." },
  { title: "Отвечайте покупателям", text: "Покупатель выбирает размер и пишет вам в WhatsApp с готовым сообщением: какой товар и какой размер." }
];

const features: { icon: IconSvgElement; title: string; text: string }[] = [
  { icon: SmartPhone01Icon, title: "Всё с телефона", text: "Добавлять товары, менять цены и наличие можно прямо в магазине, без компьютера." },
  { icon: Camera01Icon, title: "Фото, размеры, цвета", text: "Несколько фото на товар, размеры и цвета, разные цены для разных вариантов." },
  { icon: Mic01Icon, title: "Карточка голосом", text: "Расскажите о товаре — ИИ заполнит название, описание и характеристики." },
  { icon: FilterIcon, title: "Удобно покупателям", text: "Поиск, категории, фильтры по размеру и цвету, избранное. Работает на любом телефоне." },
  { icon: QrCodeIcon, title: "QR-плакат", text: "Распечатайте плакат с QR-кодом: посетитель сканирует и уносит ваш каталог с собой." },
  { icon: Analytics01Icon, title: "Статистика", text: "Сколько человек посмотрели витрину и сколько раз вам написали или позвонили." }
];

const faq = [
  {
    question: "Нужен ли свой сайт или домен?",
    answer: "Нет. Витрина открывается по готовой ссылке, её можно сразу отправлять покупателям."
  },
  {
    question: "Покупатели смогут оплатить заказ на сайте?",
    answer: "Нет, и это специально: витрина — это каталог. Покупатель пишет или звонит вам, а продаёте вы как привыкли, без комиссий площадок."
  },
  {
    question: "Сложно ли добавлять товары?",
    answer: "Если умеете отправить фото в WhatsApp — справитесь. Сфотографировали, указали цену и размеры, нажали «Сохранить»."
  },
  {
    question: "Что делать, если товар закончился?",
    answer: "Отметьте «Нет в наличии» или скройте товар одним нажатием — он пропадёт с витрины, но останется у вас в кабинете."
  },
  {
    question: "Как покупатели узнают о витрине?",
    answer: "Ссылку ставят в профиль WhatsApp и Instagram, отправляют в чаты и рассылки, а в магазине вешают QR-плакат."
  },
  {
    question: "Кто всё настроит?",
    answer: "Оставьте заявку — мы создадим витрину, выдадим вход в кабинет и поможем добавить первые товары."
  }
];

function scrollToLead() {
  document.getElementById("lead")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function HomePage() {
  useDocumentMeta(null);

  return (
    <Page className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroText}>
          <Badge tone="accent">Для магазинов одежды</Badge>
          <h1 className={styles.heroTitle}>Каталог вашего магазина — по одной ссылке</h1>
          <p className={styles.lead}>
            Покупатели смотрят фото, цены, размеры и наличие с телефона и пишут вам в WhatsApp. Без сайта, корзины и комиссий.
          </p>
          <div className={styles.heroActions}>
            <Button variant="primary" size="lg" iconEnd={ArrowRight01Icon} onClick={scrollToLead}>
              Подключить магазин
            </Button>
            {DEMO_STORE_SLUG && (
              <ButtonLink variant="outline" size="lg" to={`/m/${DEMO_STORE_SLUG}`}>
                Посмотреть пример
              </ButtonLink>
            )}
          </div>
          <ul className={styles.heroPoints}>
            <li>
              <Icon icon={CheckmarkCircle02Icon} size="sm" />
              Без сайта и программиста
            </li>
            <li>
              <Icon icon={CheckmarkCircle02Icon} size="sm" />
              Управление с телефона
            </li>
          </ul>
        </div>
        <PhoneMock className={styles.heroPhone} />
      </section>

      <Section id="how" eyebrow="Как это работает" title="Три шага до первых сообщений от покупателей">
        <ol className={styles.steps}>
          {steps.map((step, index) => (
            <li key={step.title} className={styles.step}>
              <span className={styles.stepNumber}>{index + 1}</span>
              <h3 className={styles.cardTitle}>{step.title}</h3>
              <p className={styles.cardText}>{step.text}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section eyebrow="Возможности" title="Всё, что нужно небольшому магазину, и ничего лишнего">
        <div className={styles.features}>
          {features.map((feature) => (
            <Card key={feature.title} padding="lg" className={styles.feature}>
              <span className={styles.featureIcon}>
                <Icon icon={feature.icon} size="md" />
              </span>
              <h3 className={styles.cardTitle}>{feature.title}</h3>
              <p className={styles.cardText}>{feature.text}</p>
            </Card>
          ))}
        </div>
      </Section>

      <Section id="pricing" eyebrow="Тарифы" title="Стоимость">
        <div className={styles.plans}>
          {PLANS.map((plan) => (
            <PlanCard key={plan.name} plan={plan} />
          ))}
        </div>
      </Section>

      <Section eyebrow="Вопросы" title="Частые вопросы">
        <div className={styles.faq}>
          {faq.map((item) => (
            <details key={item.question} className={styles.faqItem}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </Section>

      <section id="lead" className={styles.leadSection} aria-labelledby="lead-title">
        <div className={styles.leadText}>
          <h2 id="lead-title" className={styles.sectionTitle}>
            Подключим ваш магазин
          </h2>
          <p className={styles.lead}>Оставьте телефон — перезвоним, покажем витрину на примере и ответим на вопросы.</p>
          <ul className={styles.leadPoints}>
            <li>
              <Icon icon={Call02Icon} size="sm" />
              Перезвоним и расскажем, как всё устроено
            </li>
            <li>
              <Icon icon={Link04Icon} size="sm" />
              Создадим витрину и выдадим вход в кабинет
            </li>
            <li>
              <Icon icon={Camera01Icon} size="sm" />
              Поможем добавить первые товары
            </li>
          </ul>
          {(SALES_CONTACTS.whatsapp || SALES_CONTACTS.phone) && (
            <div className={styles.salesContacts}>
              {SALES_CONTACTS.whatsapp && (
                <ButtonLink variant="outline" icon={WhatsappIcon} href={whatsappUrl(SALES_CONTACTS.whatsapp, "Здравствуйте! Хочу подключить витрину.")} target="_blank" rel="noreferrer">
                  Написать в WhatsApp
                </ButtonLink>
              )}
              {SALES_CONTACTS.phone && (
                <ButtonLink variant="outline" icon={Call02Icon} href={phoneUrl(SALES_CONTACTS.phone)}>
                  {SALES_CONTACTS.phone}
                </ButtonLink>
              )}
            </div>
          )}
        </div>
        <Card padding="lg" className={styles.leadCard}>
          <LeadForm />
        </Card>
      </section>

      <footer className={styles.footer}>
        <span>Витрины — каталог магазина по ссылке</span>
        <nav className={styles.footerLinks} aria-label="Документы">
          <Link to="/offer">Оферта</Link>
          <Link to="/privacy">Политика конфиденциальности</Link>
          <Link to="/login">Вход для владельцев</Link>
        </nav>
      </footer>
    </Page>
  );
}

function Section({ id, eyebrow, title, children }: { id?: string; eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className={styles.section} aria-label={eyebrow}>
      <div className={styles.sectionHead}>
        <span className={styles.eyebrow}>{eyebrow}</span>
        <h2 className={styles.sectionTitle}>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  return (
    <Card padding="lg" className={cx(styles.plan, plan.highlighted && styles.planHighlighted)}>
      <div className={styles.planHead}>
        <h3 className={styles.cardTitle}>{plan.name}</h3>
        <p className={styles.cardText}>{plan.description}</p>
      </div>
      <p className={styles.planPrice}>
        {plan.price != null ? (
          <>
            {plan.price.toLocaleString("ru-RU")} ₽ <small>{plan.period}</small>
          </>
        ) : (
          "Цена по запросу"
        )}
      </p>
      <ul className={styles.planFeatures}>
        {plan.features.map((feature) => (
          <li key={feature}>
            <Icon icon={CheckmarkCircle02Icon} size="sm" />
            {feature}
          </li>
        ))}
      </ul>
      <Button variant={plan.highlighted ? "primary" : "outline"} size="lg" block onClick={scrollToLead}>
        {plan.price != null ? "Подключить" : "Узнать цену"}
      </Button>
    </Card>
  );
}
