import {
  AiMagicIcon,
  Analytics01Icon,
  ArrowRight01Icon,
  Call02Icon,
  CheckmarkCircle02Icon,
  FilterIcon,
  Link04Icon,
  QrCodeIcon,
  SmartPhone01Icon,
  Tag01Icon,
  WhatsappIcon
} from "@hugeicons/core-free-icons";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { LeadForm } from "../components/landing/LeadForm";
import { PhoneMock } from "../components/landing/PhoneMock";
import { PackageCard } from "../components/landing/PackageCard";
import { PlanCard } from "../components/landing/PlanCard";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { useSiteSettings } from "../state/siteSettings";
import { phoneUrl, whatsappUrl } from "../utils/contact";
import { Badge, Button, ButtonLink, Card, Icon, Page, type IconSvgElement } from "../ui";
import styles from "./HomePage.module.css";

const steps = [
  {
    title: "Добавьте товары",
    text: "Сфотографируйте вещь и укажите цену, размеры и цвета. С ИИ-помощником хватит фото и пары слов голосом — карточку он заполнит сам."
  },
  {
    title: "Поделитесь ссылкой",
    text: "Отправьте ссылку на витрину в чаты, поставьте в профиль WhatsApp и Instagram. Для магазина — готовый QR-плакат из кабинета, его остаётся распечатать."
  },
  {
    title: "Отвечайте покупателям",
    text: "Покупатель выбирает товар, цвет и размер и пишет вам в WhatsApp — сообщение со ссылкой на товар уже готово. Можно и позвонить, и написать в Telegram."
  }
];

const features: { icon: IconSvgElement; title: string; text: string }[] = [
  { icon: SmartPhone01Icon, title: "Всё с телефона", text: "Добавлять товары, менять цены и наличие можно прямо с телефона, без компьютера." },
  { icon: Tag01Icon, title: "Гибкие цены", text: "Своя цена для каждого размера и цвета или текст вместо цены, например «по запросу». И несколько фото на товар." },
  { icon: AiMagicIcon, title: "Карточка с помощью ИИ", text: "Сфотографируйте товар и расскажите о нём голосом — ИИ заполнит название, описание, размеры и цвета и нарисует обложку." },
  { icon: FilterIcon, title: "Удобно покупателям", text: "Поиск, категории, фильтры по размеру и цвету, избранное. Открывается в браузере любого телефона — ничего не нужно скачивать." },
  { icon: QrCodeIcon, title: "Ссылка и QR-код", text: "Ссылку отправляйте в чаты и соцсети, а в магазине повесьте QR-плакат: покупатель наведёт камеру и откроет витрину." },
  { icon: Analytics01Icon, title: "Статистика", text: "Сколько человек посмотрели витрину и сколько раз вам написали или позвонили." }
];

const faq = [
  {
    question: "Нужно ли заказывать сайт или покупать домен?",
    answer: "Нет. Витрина — это уже готовый сайт вашего магазина со своей ссылкой. Её можно сразу отправлять покупателям."
  },
  {
    question: "Покупатели смогут оплатить заказ на витрине?",
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
    answer: "Оставьте заявку — мы создадим витрину и выдадим вход в кабинет. Товары вы добавляете сами, с телефона: это пара минут на товар, а с ИИ-помощником — быстрее."
  }
];

function scrollToLead() {
  document.getElementById("lead")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function HomePage() {
  useDocumentMeta(null);
  // Plans and prices («Тарифы и цены») and contacts («Контакты») come from the admin panel.
  const site = useSiteSettings();
  const sales = site?.salesContacts;

  return (
    <Page className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroText}>
          <Badge tone="accent">Для магазинов одежды</Badge>
          <h1 className={styles.heroTitle}>Каталог вашего магазина — по одной ссылке</h1>
          <p className={styles.lead}>
            Покупатели смотрят фото, цены, размеры и наличие с телефона и пишут вам в WhatsApp. Без корзины и комиссий площадок.
          </p>
          <div className={styles.heroActions}>
            <Button variant="primary" size="lg" iconEnd={ArrowRight01Icon} onClick={scrollToLead}>
              Подключить магазин
            </Button>
          </div>
          <ul className={styles.heroPoints}>
            <li>
              <Icon icon={CheckmarkCircle02Icon} size="sm" />
              Свой сайт без программиста
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

      {site && site.plans.length > 0 && (
        <Section id="pricing" eyebrow="Тарифы" title="Стоимость">
          <div className={styles.plans} data-count={Math.min(site.plans.length, 3)}>
            {site.plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                extra={plan.aiMonthlyLimit ? `До ${plan.aiMonthlyLimit} карточек с ИИ в месяц` : undefined}
                highlighted={plan.highlighted}
                action={<PlanButton price={plan.price} highlighted={plan.highlighted} />}
              />
            ))}
          </div>
          {site.packages.length > 0 && (
            <div className={styles.addons}>
              <div className={styles.addonsHead}>
                <h3 className={styles.cardTitle}>Можно докупить</h3>
                <p className={styles.cardText}>Разово, к любому тарифу: больше ИИ-превью и карточек с ИИ, помощь с витриной.</p>
              </div>
              <div className={styles.plans} data-count={Math.min(site.packages.length, 3)}>
                {site.packages.map((item) => (
                  <PackageCard
                    key={item.id}
                    item={item}
                    action={
                      <Button variant="outline" size="lg" block onClick={scrollToLead}>
                        Узнать подробнее
                      </Button>
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

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
              <Icon icon={SmartPhone01Icon} size="sm" />
              Товары добавите сами, с телефона
            </li>
          </ul>
          {sales && (sales.whatsapp || sales.phone) && (
            <div className={styles.salesContacts}>
              {sales.whatsapp && (
                <ButtonLink variant="outline" icon={WhatsappIcon} href={whatsappUrl(sales.whatsapp, "Здравствуйте! Хочу подключить витрину.")} target="_blank" rel="noreferrer">
                  Написать в WhatsApp
                </ButtonLink>
              )}
              {sales.phone && (
                <ButtonLink variant="outline" icon={Call02Icon} href={phoneUrl(sales.phone)}>
                  {sales.phone}
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

/** Under a plan card: leads to the request form. */
function PlanButton({ price, highlighted = false }: { price: number | null; highlighted?: boolean }) {
  return (
    <Button variant={highlighted ? "primary" : "outline"} size="lg" block onClick={scrollToLead}>
      {price != null ? "Подключить" : "Узнать цену"}
    </Button>
  );
}
