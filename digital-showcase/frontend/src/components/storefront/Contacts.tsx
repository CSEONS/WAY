import { BubbleChatIcon, Copy01Icon } from "@hugeicons/core-free-icons";
import { type ReactNode, useState } from "react";
import type { Store } from "../../types/models";
import { Button, Modal, useCopyToClipboard, type ButtonSize } from "../../ui";
import {
  hasContacts,
  instagramUrl,
  phoneUrl,
  socialHandle,
  telegramUrl,
  telegramUsername,
  trackContact,
  vkUrl,
  whatsappUrl,
  type ContactChannel
} from "../../utils/contact";
import { ChannelList, ChannelRow } from "./ChannelList";
import styles from "./Contacts.module.css";

type StoreContacts = Pick<Store, "name" | "phone" | "whatsapp" | "telegram" | "instagram" | "vk">;

interface ContactProps {
  store: StoreContacts;
  storeSlug: string;
  /** Counted as a contact about this product in the owner's stats. */
  productId?: string;
  /** A ready question about the product: WhatsApp gets it filled in, the other chats can copy it. */
  message?: string;
}

interface Channel {
  channel: ContactChannel;
  label: string;
  /** Under the name: the number, the account, or that the message is ready. */
  detail: string;
  href: string;
  /** The question about the product is typed in when the chat opens. */
  prefilled?: boolean;
}

const READY = "Сообщение о товаре уже готово";

/** The ways to reach the store the owner filled in, in this order. */
function channelsOf(store: StoreContacts, message?: string) {
  // A Telegram account takes the message too; an invite link (t.me/+…) doesn't.
  const telegramPrefilled = Boolean(message && store.telegram && telegramUsername(store.telegram));
  return [
    store.whatsapp && {
      channel: "whatsapp",
      label: "WhatsApp",
      detail: message ? READY : store.whatsapp,
      href: whatsappUrl(store.whatsapp, message),
      prefilled: Boolean(message)
    },
    store.telegram && {
      channel: "telegram",
      label: "Telegram",
      detail: telegramPrefilled ? READY : socialHandle(store.telegram),
      href: telegramUrl(store.telegram, message),
      prefilled: telegramPrefilled
    },
    store.instagram && { channel: "instagram", label: "Instagram", detail: socialHandle(store.instagram), href: instagramUrl(store.instagram) },
    store.vk && { channel: "vk", label: "ВКонтакте", detail: socialHandle(store.vk), href: vkUrl(store.vk) },
    store.phone && { channel: "phone", label: "Позвонить", detail: store.phone, href: phoneUrl(store.phone) }
  ].filter(Boolean) as Channel[];
}

/**
 * «Связаться с магазином»: every way the owner left — WhatsApp and Telegram
 * with the question about the product typed in, Instagram, VK, a call.
 * Chats that can't take a ready text get it to copy.
 */
export function ContactModal({ onClose, ...props }: ContactProps & { onClose: () => void }) {
  const copy = useCopyToClipboard();
  const channels = channelsOf(props.store, props.message);
  // Instagram and VK can't take a ready text: the buyer pastes it.
  const canPaste = channels.some((item) => item.channel !== "phone" && !item.prefilled);

  return (
    <Modal title="Связаться с магазином" description={props.store.name} size="sm" onClose={onClose}>
      <ChannelList>
        {channels.map((item) => (
          <ChannelRow
            key={item.channel}
            channel={item.channel}
            label={item.label}
            detail={item.detail}
            href={item.href}
            onClick={() => trackContact(props.storeSlug, item.channel, props.productId)}
          />
        ))}
      </ChannelList>
      {props.message && canPaste && (
        <Button variant="ghost" icon={Copy01Icon} className={styles.copy} onClick={() => void copy(props.message!, "Вопрос о товаре скопирован — вставьте его в чат")}>
          Скопировать вопрос о товаре
        </Button>
      )}
    </Modal>
  );
}

/** «Связаться»: one button for the buyer, the ways to reach the store in a window. Nothing when the store left no contacts. */
export function ContactButton({ size = "lg", block, className, ...props }: ContactProps & { size?: ButtonSize; block?: boolean; className?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  if (!hasContacts(props.store)) return null;
  return (
    <>
      <Button variant="primary" size={size} block={block} icon={BubbleChatIcon} className={className} onClick={() => setIsOpen(true)}>
        Связаться
      </Button>
      {isOpen && <ContactModal {...props} onClose={() => setIsOpen(false)} />}
    </>
  );
}

/** The bar fixed to the bottom of a phone screen, with any buttons — e.g. the owner's «Поделиться». */
export function MobileActionBar({ children }: { children: ReactNode }) {
  return (
    <>
      <div className={styles.barSpacer} aria-hidden="true" />
      <div className={styles.bar}>{children}</div>
    </>
  );
}

/** Pinned to the bottom of the screen on phones, so the buyer can get in touch from anywhere in the catalog. */
export function MobileContactBar(props: ContactProps) {
  if (!hasContacts(props.store)) return null;
  return (
    <MobileActionBar>
      <ContactButton {...props} block />
    </MobileActionBar>
  );
}
