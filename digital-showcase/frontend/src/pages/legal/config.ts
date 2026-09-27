// Who runs the service, for the privacy policy and the offer (/privacy, /offer).
// Until the operator and INN are filled in, both pages show a «шаблон» notice
// and highlight every missing value. Have a lawyer read the texts once.

export const LEGAL = {
  /** «Иванов Иван Иванович», «ИП Иванов Иван Иванович» or «ООО „Витрины“». */
  operator: "",
  /** Self-employed (НПД) / sole trader / company. */
  status: "самозанятый (плательщик налога на профессиональный доход)",
  inn: "",
  /** ОГРНИП or ОГРН; empty for the self-employed. */
  ogrn: "",
  /** Where requests about personal data are sent. */
  email: "",
  phone: "",
  /** Postal address (city is enough for the self-employed). */
  address: "",
  /** Date of this version of both documents. */
  updatedAt: "2026-09-27",
  /** After the paid date, how long a store's data is kept before deletion. */
  keepDataDays: 90
};

export function isLegalFilled() {
  return Boolean(LEGAL.operator && LEGAL.inn && LEGAL.email);
}
