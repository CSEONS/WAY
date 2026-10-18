import { Call02Icon, InstagramIcon, TelegramIcon, VkIcon, WhatsappIcon } from "@hugeicons/core-free-icons";
import type { ReactNode } from "react";
import { Icon, Spinner, cx, type IconSvgElement } from "../../ui";
import type { ContactChannel } from "../../utils/contact";
import styles from "./ChannelList.module.css";

const ICONS: Record<ContactChannel, IconSvgElement> = {
  whatsapp: WhatsappIcon,
  telegram: TelegramIcon,
  instagram: InstagramIcon,
  vk: VkIcon,
  phone: Call02Icon
};

/** Rows of ways to reach or share — «Связаться» for buyers, «Поделиться» for the owner. */
export function ChannelList({ children }: { children: ReactNode }) {
  return <div className={styles.channels}>{children}</div>;
}

interface ChannelRowProps {
  channel: ContactChannel;
  label: string;
  /** Under the label: the number, the account, what happens. */
  detail: string;
  /** A link (a chat, a call)… */
  href?: string;
  /** …or an action. */
  onClick?: () => void;
  /** Waiting for something (e.g. the photo being prepared): not pressable yet. */
  busy?: boolean;
}

/** One way: the network's icon in its color, its name and the account. */
export function ChannelRow({ channel, label, detail, href, onClick, busy }: ChannelRowProps) {
  const content = (
    <>
      <span className={cx(styles.icon, styles[channel])}>
        <Icon icon={ICONS[channel]} size="md" />
      </span>
      <span className={styles.text}>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
      {busy && <Spinner size="sm" className={styles.spinner} />}
    </>
  );
  if (href) {
    const external = channel !== "phone";
    return (
      <a href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined} className={styles.channel} onClick={onClick}>
        {content}
      </a>
    );
  }
  return (
    <button type="button" className={styles.channel} onClick={onClick} disabled={busy} aria-busy={busy || undefined}>
      {content}
    </button>
  );
}
