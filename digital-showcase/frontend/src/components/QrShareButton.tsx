import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, QrCode01Icon } from "@hugeicons/core-free-icons";
import QRCode from "qrcode";
import { useState } from "react";

export function QrShareButton({ url, label = "QR" }: { url: string; label?: string }) {
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  async function openQr() {
    const dataUrl = await QRCode.toDataURL(url, { width: 320, margin: 2 });
    setQrDataUrl(dataUrl);
    setIsOpen(true);
  }

  async function shareQr() {
    if (navigator.share) {
      await navigator.share({ title: "Публичная витрина", text: "Ссылка на витрину", url });
      return;
    }
    await navigator.clipboard?.writeText(url);
  }

  return (
    <>
      <button type="button" className="btn btn-outline btn-sm" onClick={openQr}>
        <HugeiconsIcon icon={QrCode01Icon} size={16} strokeWidth={1.8} />
        {label}
      </button>
      {isOpen && (
        <div className="modal-backdrop" role="presentation" onPointerDown={(event) => event.currentTarget === event.target && setIsOpen(false)}>
          <div className="modal qr-modal" role="dialog" aria-modal="true">
            <div className="modal-head">
              <div className="modal-title">
                <h2>QR-код витрины</h2>
                <p>{url}</p>
              </div>
              <button type="button" className="btn-icon btn-ghost" aria-label="Закрыть" onClick={() => setIsOpen(false)}>
                <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={1.8} />
              </button>
            </div>
            {qrDataUrl && <img src={qrDataUrl} alt="QR-код публичной витрины" />}
            <div className="modal-actions">
              <a className="btn btn-secondary" href={qrDataUrl} download="store-qr.png">
                Скачать
              </a>
              <button type="button" className="btn btn-primary" onClick={shareQr}>
                Поделиться
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

