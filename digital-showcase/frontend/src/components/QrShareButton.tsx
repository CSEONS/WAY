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
        <div className="modal-backdrop" role="presentation" onPointerDown={(event) => event.currentTarget === event.target && setIsOpen(false)}>
          <div className="modal qr-modal" role="dialog" aria-modal="true" aria-labelledby="qr-title">
            <div className="modal-head">
              <div>
                <h2 id="qr-title">QR-код витрины</h2>
                <p>{url}</p>
              </div>
              <button className="icon-button" type="button" aria-label="Закрыть" onClick={() => setIsOpen(false)}>
                x
              </button>
            </div>
            {qrDataUrl && <img className="qr-image" src={qrDataUrl} alt="QR-код публичной витрины" />}
            <div className="modal-actions">
              <a className="button-link" href={qrDataUrl} download="store-qr.png">
                Скачать
              </a>
              <button className="primary" type="button" onClick={shareQr}>
                Поделиться
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
