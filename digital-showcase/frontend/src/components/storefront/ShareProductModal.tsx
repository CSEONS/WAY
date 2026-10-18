import { Copy01Icon, Download04Icon, Settings02Icon, Share08Icon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import type { Store } from "../../types/models";
import { Button, ButtonLink, Field, Modal, Notice, Textarea, useCopyToClipboard, useToast } from "../../ui";
import type { ContactChannel } from "../../utils/contact";
import { ChannelList, ChannelRow } from "./ChannelList";
import styles from "./ShareProductModal.module.css";

interface ShareProductModalProps {
  store: Pick<Store, "id" | "whatsapp" | "telegram" | "instagram" | "vk">;
  title: string;
  /** «2 500 ₽», «Цена в магазине». */
  priceText: string;
  /** The photo shown on the page now; null — the product has none. */
  photoUrl: string | null;
  productUrl: string;
  onClose: () => void;
}

/** Waiting for the photo longer than this: share without it (a link and the text). */
const PHOTO_WAIT_MS = 8000;

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

/** The photo as JPEG: WhatsApp statuses and Instagram stories don't all take WebP. */
async function jpegFile(url: string) {
  const image = await loadImage(url);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  canvas.getContext("2d")?.drawImage(image, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  return blob ? new File([blob], "tovar.jpg", { type: "image/jpeg" }) : null;
}

function download(file: File) {
  const href = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = href;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

/**
 * «Поделиться в соцсетях» on the owner's own product: buttons for the networks
 * the store has in «Реквизиты». On a phone the photo goes to the share sheet,
 * where WhatsApp offers «Мой статус» and Instagram — stories. Telegram and VK
 * take a link with the text (the photo comes in the link's preview): Telegram
 * drops the text of a photo sent through the share sheet. A Telegram story
 * can't be handed a photo from a site: the photo is saved, the text copied
 * and Telegram's story editor opened (tg://post/photo) to pick it. Where a
 * device can't share a photo (a computer), the photo is saved and the text
 * copied, with a word on where to add them.
 */
export function ShareProductModal({ store, title, priceText, photoUrl, productUrl, onClose }: ShareProductModalProps) {
  const toast = useToast();
  const copy = useCopyToClipboard();
  const [caption, setCaption] = useState(`${title} — ${priceText}\n${productUrl}`);
  // Prepared at once: a share sheet only opens straight from a tap, there's no time to convert then.
  const [photo, setPhoto] = useState<File | null>();

  useEffect(() => {
    let cancelled = false;
    if (!photoUrl) {
      setPhoto(null);
      return;
    }
    const giveUp = setTimeout(() => !cancelled && setPhoto((current) => (current === undefined ? null : current)), PHOTO_WAIT_MS);
    jpegFile(photoUrl)
      .then((file) => !cancelled && setPhoto(file))
      .catch(() => !cancelled && setPhoto(null))
      .finally(() => clearTimeout(giveUp));
    return () => {
      cancelled = true;
      clearTimeout(giveUp);
    };
  }, [photoUrl]);

  const canSharePhoto = Boolean(photo && navigator.canShare?.({ files: [photo] }));

  /** The share sheet with the photo and the text; false — not on this device, or nothing to share. */
  async function sharePhoto() {
    if (!photo || !canSharePhoto) return false;
    try {
      await navigator.share({ files: [photo], text: caption });
    } catch {
      // Closed the share sheet.
    }
    return true;
  }

  /** WhatsApp status, Instagram story: the share sheet, or the photo saved and the text copied. */
  async function sharePhotoTo(where: string) {
    if (await sharePhoto()) return;
    if (photo) download(photo);
    await copy(caption, photo ? `Фото сохранено, текст скопирован. ${where}` : `Текст скопирован. ${where}`);
  }

  function openLink(url: string) {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  /** Stories are posted from the Telegram app on a phone; a computer gets the photo and directions. */
  async function shareToTelegramStory() {
    const isPhone = window.matchMedia?.("(pointer: coarse)").matches;
    if (photo) download(photo);
    const saved = photo ? "Фото сохранено, текст скопирован." : "Текст скопирован.";
    await copy(
      caption,
      isPhone ? `${saved} Выберите фото в редакторе истории Telegram` : `${saved} Истории публикуются с телефона: Telegram → «Добавить историю»`
    );
    // A moment for the download to start before the app takes over.
    if (isPhone) setTimeout(() => (window.location.href = "tg://post/photo"), 800);
  }

  const text = caption.replace(productUrl, "").trim();
  const absolutePhoto = photoUrl ? new URL(photoUrl, window.location.origin).href : "";
  // needsPhoto: the button waits while the photo is being prepared; the others work with a link at once.
  type Network = { key: string; channel: ContactChannel; label: string; detail: string; needsPhoto?: boolean; onClick: () => void };
  const networks = ([
    store.whatsapp && {
      key: "whatsapp",
      channel: "whatsapp",
      label: "В статус WhatsApp",
      detail: "Фото с подписью",
      needsPhoto: true,
      onClick: () => void sharePhotoTo("Откройте WhatsApp на телефоне → «Статус» и добавьте фото.")
    },
    store.instagram && {
      key: "instagram",
      channel: "instagram",
      label: "В историю Instagram",
      detail: "Фото, подпись скопируется",
      needsPhoto: true,
      onClick: () => void sharePhotoTo("Откройте Instagram на телефоне → «История» и добавьте фото.")
    },
    store.telegram && {
      key: "telegram-story",
      channel: "telegram",
      label: "В историю Telegram",
      detail: "Фото, подпись скопируется",
      needsPhoto: true,
      onClick: () => void shareToTelegramStory()
    },
    store.telegram && {
      key: "telegram",
      channel: "telegram",
      label: "В чат или канал Telegram",
      detail: "Ссылка с фото и подписью",
      onClick: () => openLink(`https://t.me/share/url?url=${encodeURIComponent(productUrl)}&text=${encodeURIComponent(text)}`)
    },
    store.vk && {
      key: "vk",
      channel: "vk",
      label: "ВКонтакте",
      detail: "На стену или в сообщения",
      onClick: () =>
        openLink(
          `https://vk.com/share.php?url=${encodeURIComponent(productUrl)}&title=${encodeURIComponent(text)}${absolutePhoto ? `&image=${encodeURIComponent(absolutePhoto)}` : ""}`
        )
    }
  ] as (Network | "" | null | undefined)[]).filter((item): item is Network => Boolean(item));

  return (
    <Modal title="Поделиться товаром" description="Фото и текст со ссылкой на товар" onClose={onClose}>
      <div className={styles.preview}>
        {photoUrl && <img src={photoUrl} alt="" className={styles.photo} />}
        <Field label="Текст" hint="Ссылка ведёт на этот товар на вашей витрине">
          <Textarea rows={3} value={caption} onChange={(event) => setCaption(event.target.value)} />
        </Field>
      </div>

      {networks.length > 0 ? (
        <ChannelList>
          {networks.map((network) => (
            <ChannelRow
              key={network.key}
              channel={network.channel}
              label={network.label}
              detail={network.detail}
              busy={network.needsPhoto && photo === undefined}
              onClick={network.onClick}
            />
          ))}
        </ChannelList>
      ) : (
        <Notice
          tone="neutral"
          action={
            <ButtonLink variant="secondary" size="sm" icon={Settings02Icon} to={`/dashboard/stores/${store.id}/settings`}>
              Реквизиты
            </ButtonLink>
          }
        >
          Укажите WhatsApp, Telegram, Instagram или ВКонтакте в «Реквизитах» — здесь появятся кнопки для них.
        </Notice>
      )}

      <div className={styles.more}>
        {canSharePhoto && (
          <Button variant="ghost" icon={Share08Icon} onClick={() => void sharePhoto()}>
            Другое приложение
          </Button>
        )}
        {photo && (
          <Button
            variant="ghost"
            icon={Download04Icon}
            onClick={() => {
              download(photo);
              toast.show("Фото сохранено", { tone: "success" });
            }}
          >
            Скачать фото
          </Button>
        )}
        <Button variant="ghost" icon={Copy01Icon} onClick={() => void copy(caption, "Текст со ссылкой скопирован")}>
          Скопировать текст
        </Button>
      </div>
    </Modal>
  );
}
