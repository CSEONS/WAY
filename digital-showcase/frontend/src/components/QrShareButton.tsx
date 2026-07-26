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
      <button type="button" onClick={openQr}>
        {label}
      </button>
      {isOpen && (
        <div role="presentation" onPointerDown={(event) => event.currentTarget === event.target && setIsOpen(false)}>
          <div role="dialog" aria-modal="true">
            <div>
              <div>
                <h2>QR-код витрины</h2>
                <p>{url}</p>
              </div>
              <button type="button" aria-label="Закрыть" onClick={() => setIsOpen(false)}>
                x
              </button>
            </div>
            {qrDataUrl && <img src={qrDataUrl} alt="QR-код публичной витрины" />}
            <div>
              <a href={qrDataUrl} download="store-qr.png">
                Скачать
              </a>
              <button type="button" onClick={shareQr}>
                Поделиться
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

