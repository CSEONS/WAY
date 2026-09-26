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
    description: "Всё, чтобы показать ассортимент одного магазина.",
    features: [
      "Ссылка на витрину и QR-плакат для кассы",
      "Товары с фото, размерами, цветами и ценами",
      "Кнопки WhatsApp, Telegram и звонка",
      "Статистика просмотров и обращений",
      "Поможем запуститься и добавить первые товары"
    ],
    highlighted: true
  },
  {
    name: "Несколько магазинов",
    price: null,
    period: "в месяц",
    description: "Для нескольких точек — у каждой своя витрина.",
    features: ["Отдельная витрина и ссылка для каждой точки", "Один вход для владельца", "Добавление товаров пачкой с помощью ИИ", "Личный менеджер"]
  }
];
