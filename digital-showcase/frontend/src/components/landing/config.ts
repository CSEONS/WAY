// Everything on the landing page that changes with the business, not the
// code: prices, the demo store, how to reach you. Edit here.

/** Slug of a store filled with sample products: «Посмотреть пример» opens /m/<slug>. Empty — no button. */
export const DEMO_STORE_SLUG = "demo";

/** Your own contacts for «Написать нам». Empty — only the request form is shown. */
export const SALES_CONTACTS = {
  whatsapp: "",
  phone: ""
};

export interface Plan {
  name: string;
  /** Rubles. null — «Цена по запросу». */
  price: number | null;
  period: string;
  description: string;
  features: string[];
  /** The plan most people should pick: shown with an accent. */
  highlighted?: boolean;
}

export const PLANS: Plan[] = [
  {
    name: "Витрина",
    price: null,
    period: "в месяц",
    description: "Каталог магазина по ссылке — всё, чтобы покупатели писали вам.",
    features: [
      "Ссылка на витрину и QR-плакат для кассы",
      "Товары с фото, размерами, цветами и ценами",
      "Кнопки WhatsApp, Telegram и звонка",
      "Статистика и отчёт за месяц",
      "Поможем запуститься и добавить первые товары"
    ]
  },
  {
    name: "Витрина + ИИ",
    price: null,
    period: "в месяц",
    description: "То же, плюс ИИ-помощник: товар добавляется по фото и голосу за полминуты.",
    features: [
      "Всё из тарифа «Витрина»",
      "Карточка товара по фото и голосовому описанию",
      "Много товаров сразу: ИИ сам разберёт фото по карточкам",
      "До 100 карточек с ИИ в месяц"
    ],
    highlighted: true
  }
];
