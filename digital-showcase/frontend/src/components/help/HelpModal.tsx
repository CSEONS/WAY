import { Call02Icon, PlayCircleIcon, TelegramIcon, WhatsappIcon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { SupportContacts } from "../../types/models";
import { ButtonLink, Icon, LoadingState, Modal } from "../../ui";
import { phoneUrl, telegramUrl, whatsappUrl } from "../../utils/contact";
import { HELP_VIDEOS } from "./config";
import styles from "./HelpModal.module.css";

const QUESTIONS = [
  {
    question: "Как добавить товар?",
    answer: "«Добавить товар» → сфотографируйте вещь → расскажите о ней голосом или укажите цену и размеры → «Опубликовать». Товар сразу появится на витрине."
  },
  {
    question: "Товар закончился — что сделать?",
    answer: "В списке товаров нажмите «⋮» → «Нет в наличии». Или выключите «На витрине», чтобы спрятать его совсем."
  },
  {
    question: "Как изменить цену?",
    answer: "В списке товаров: «⋮» → «Изменить цену». Можно писать как удобно: 1500, 1 500 или 1500 ₽."
  },
  {
    question: "Как рассказать покупателям о витрине?",
    answer: "Под названием магазина: «Копировать» — ссылка для WhatsApp и соцсетей, «QR» — показать с телефона, «Плакат» — распечатать для кассы или двери."
  },
  {
    question: "Как поставить кабинет на экран телефона?",
    answer: "Android: кнопка «Установить» в кабинете. iPhone: откройте кабинет в Safari → «Поделиться» → «На экран «Домой»»."
  },
  {
    question: "Как продлить подписку?",
    answer: "Кабинет → «Подписка и итоги» → «Написать администратору». Там же видно, до какого числа оплачено."
  },
  {
    question: "Забыли пароль?",
    answer: "Напишите в поддержку — пароль сбросят и пришлют новый."
  }
];

/** «Помощь»: write or call support, short videos, answers to the usual questions. */
export function HelpModal({ onClose }: { onClose: () => void }) {
  const [support, setSupport] = useState<SupportContacts | null>();

  useEffect(() => {
    api
      .get<SupportContacts>("/owner/support")
      .then((res) => setSupport(res.data))
      .catch(() => setSupport(null));
  }, []);

  const hasContacts = Boolean(support && (support.telegram || support.whatsapp || support.phone));

  return (
    <Modal title="Помощь" description="Не получается или непонятно — напишите, поможем." onClose={onClose}>
      {support === undefined ? (
        <LoadingState />
      ) : hasContacts ? (
        <div className={styles.contacts}>
          {support!.telegram && (
            <ButtonLink variant="primary" icon={TelegramIcon} href={telegramUrl(support!.telegram)} target="_blank" rel="noreferrer">
              Написать в Telegram
            </ButtonLink>
          )}
          {support!.whatsapp && (
            <ButtonLink
              variant={support!.telegram ? "outline" : "primary"}
              icon={WhatsappIcon}
              href={whatsappUrl(support!.whatsapp, "Здравствуйте! Нужна помощь с витриной.")}
              target="_blank"
              rel="noreferrer"
            >
              WhatsApp
            </ButtonLink>
          )}
          {support!.phone && (
            <ButtonLink variant="outline" icon={Call02Icon} href={phoneUrl(support!.phone)}>
              {support!.phone}
            </ButtonLink>
          )}
        </div>
      ) : (
        <p className={styles.muted}>Напишите администратору, который подключал вам витрину.</p>
      )}

      {HELP_VIDEOS.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.heading}>Видео</h3>
          <ul className={styles.videos}>
            {HELP_VIDEOS.map((video) => (
              <li key={video.url}>
                <a href={video.url} target="_blank" rel="noreferrer">
                  <Icon icon={PlayCircleIcon} size="md" />
                  {video.title}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.section}>
        <h3 className={styles.heading}>Частые вопросы</h3>
        {QUESTIONS.map((item) => (
          <details key={item.question} className={styles.question}>
            <summary>{item.question}</summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </section>
    </Modal>
  );
}
