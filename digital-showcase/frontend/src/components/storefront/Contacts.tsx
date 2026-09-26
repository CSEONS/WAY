import { Call02Icon, TelegramIcon, WhatsappIcon } from "@hugeicons/core-free-icons";
import type { Store } from "../../types/models";
import { ButtonLink, cx } from "../../ui";
import { phoneUrl, telegramUrl, trackContact, whatsappUrl, type ContactChannel } from "../../utils/contact";
import styles from "./Contacts.module.css";

type StoreContacts = Pick<Store, "phone" | "whatsapp" | "telegram">;

interface ContactProps {
  store: StoreContacts;
  storeSlug: string;
  /** Counted as a contact about this product in the owner's stats. */
  productId?: string;
  /** Ready text for WhatsApp, e.g. which product and size the buyer asks about. */
  message?: string;
}

function linkProps(channel: ContactChannel, href: string, { storeSlug, productId }: ContactProps) {
  return {
    href,
    target: channel === "phone" ? undefined : "_blank",
    rel: channel === "phone" ? undefined : "noreferrer",
    onClick: () => trackContact(storeSlug, channel, productId)
  };
}

/**
 * «Написать в WhatsApp», Telegram and «Позвонить» — only the ones the owner
 * filled in, the main one first. `stack`: the main button full width, the
 * rest in a row under it; `adaptive`: stack on phones, one row on wider screens.
 */
export function ContactButtons({
  layout = "row",
  whatsappLabel = "Написать в WhatsApp",
  ...props
}: ContactProps & { layout?: "row" | "stack" | "adaptive"; whatsappLabel?: string }) {
  const { store } = props;
  const whatsapp = store.whatsapp && (
    <ButtonLink
      key="whatsapp"
      {...linkProps("whatsapp", whatsappUrl(store.whatsapp, props.message), props)}
      variant="primary"
      size="lg"
      icon={WhatsappIcon}
      className={cx(styles.whatsapp, styles.main)}
    >
      {whatsappLabel}
    </ButtonLink>
  );
  const telegram = store.telegram && (
    <ButtonLink key="telegram" {...linkProps("telegram", telegramUrl(store.telegram), props)} variant="outline" size="lg" icon={TelegramIcon}>
      Telegram
    </ButtonLink>
  );
  const phone = store.phone && (
    <ButtonLink
      key="phone"
      {...linkProps("phone", phoneUrl(store.phone), props)}
      variant={whatsapp ? "outline" : "primary"}
      size="lg"
      icon={Call02Icon}
      className={whatsapp ? undefined : styles.main}
    >
      Позвонить
    </ButtonLink>
  );
  const buttons = (whatsapp ? [whatsapp, telegram, phone] : [phone, telegram]).filter(Boolean);
  if (!buttons.length) return null;

  return <div className={cx(styles.buttons, layout !== "row" && styles.stack, layout === "adaptive" && styles.adaptive)}>{buttons}</div>;
}

/** Pinned to the bottom of the screen on phones, so the buyer can write from anywhere in the catalog. */
export function MobileContactBar({ whatsappLabel = "Написать в WhatsApp", ...props }: ContactProps & { whatsappLabel?: string }) {
  const { store } = props;
  if (!store.whatsapp && !store.phone) return null;

  return (
    <>
      <div className={styles.barSpacer} aria-hidden="true" />
      <div className={styles.bar}>
        {store.whatsapp ? (
          <ButtonLink
            {...linkProps("whatsapp", whatsappUrl(store.whatsapp, props.message), props)}
            variant="primary"
            size="lg"
            block
            icon={WhatsappIcon}
            className={styles.whatsapp}
          >
            {whatsappLabel}
          </ButtonLink>
        ) : (
          <ButtonLink {...linkProps("phone", phoneUrl(store.phone!), props)} variant="primary" size="lg" block icon={Call02Icon}>
            Позвонить
          </ButtonLink>
        )}
        {store.whatsapp && store.phone && <CallIconLink {...props} />}
      </div>
    </>
  );
}

function CallIconLink(props: ContactProps) {
  return (
    <ButtonLink
      {...linkProps("phone", phoneUrl(props.store.phone!), props)}
      variant="outline"
      size="lg"
      icon={Call02Icon}
      aria-label="Позвонить"
      title="Позвонить"
      className={styles.callButton}
    />
  );
}
