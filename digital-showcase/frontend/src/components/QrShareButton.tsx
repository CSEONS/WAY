import { Download01Icon, QrCode01Icon, Share01Icon } from "@hugeicons/core-free-icons";
import QRCode from "qrcode";
import { useState } from "react";
import { Button, ButtonLink, Modal, useCopyToClipboard } from "../ui";
import styles from "./QrShareButton.module.css";

/** `onOpen` fires when the owner opens the code (counts as sharing the link). */
export function QrShareButton({ url, label = "QR", onOpen }: { url: string; label?: string; onOpen?: () => void }) {
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const copy = useCopyToClipboard();

  async function openQr() {
    setQrDataUrl(await QRCode.toDataURL(url, { width: 320, margin: 2 }));
    setIsOpen(true);
    onOpen?.();
  }

  async function shareQr() {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Публичная витрина", text: "Ссылка на витрину", url });
      } catch {
        // The user closed the share sheet.
      }
      return;
    }
    await copy(url, "Ссылка скопирована");
  }

  return (
    <>
      <Button variant="outline" size="sm" icon={QrCode01Icon} onClick={openQr}>
        {label}
      </Button>
      {isOpen && (
        <Modal
          size="sm"
          title="QR-код витрины"
          description={url}
          onClose={() => setIsOpen(false)}
          footer={
            <>
              <ButtonLink variant="secondary" icon={Download01Icon} href={qrDataUrl} download="store-qr.png">
                Скачать
              </ButtonLink>
              <Button variant="primary" icon={Share01Icon} onClick={shareQr}>
                Поделиться
              </Button>
            </>
          }
        >
          {qrDataUrl && <img className={styles.qr} src={qrDataUrl} alt="QR-код публичной витрины" />}
        </Modal>
      )}
    </>
  );
}
