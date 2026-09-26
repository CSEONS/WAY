import { PrinterIcon, Store01Icon } from "@hugeicons/core-free-icons";
import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client";
import { markStoreShared } from "../components/dashboard/shareState";
import type { Store } from "../types/models";
import { BackLink, Button, ErrorState, Icon, LoadingState, Page } from "../ui";
import styles from "./PosterPage.module.css";

/** A4 poster with the store's QR code for the door or the fitting room. Printed or saved as PDF by the browser. */
export function PosterPage() {
  const { storeId = "" } = useParams();
  const [store, setStore] = useState<Store>();
  const [qr, setQr] = useState("");
  const [hasError, setHasError] = useState(false);
  const publicUrl = store ? `${location.origin}/m/${store.slug}` : "";

  const load = useCallback(() => {
    setHasError(false);
    api
      .get<Store>(`/owner/stores/${storeId}`)
      .then((res) => setStore(res.data))
      .catch(() => setHasError(true));
  }, [storeId]);

  useEffect(load, [load]);

  useEffect(() => {
    if (!publicUrl) return;
    QRCode.toDataURL(publicUrl, { width: 900, margin: 1, errorCorrectionLevel: "M" }).then(setQr);
    markStoreShared(storeId);
  }, [publicUrl, storeId]);

  if (hasError) {
    return (
      <Page>
        <ErrorState onRetry={load} />
      </Page>
    );
  }
  if (!store || !qr) {
    return (
      <Page>
        <LoadingState />
      </Page>
    );
  }

  return (
    <Page className={styles.page}>
      <div className={styles.controls}>
        <BackLink to={`/dashboard/stores/${storeId}`}>Вернуться в кабинет</BackLink>
        <p className={styles.tip}>Распечатайте плакат и повесьте у входа, на кассе или в примерочной. В окне печати можно выбрать «Сохранить как PDF».</p>
        <Button variant="primary" size="lg" icon={PrinterIcon} onClick={() => window.print()}>
          Распечатать или сохранить PDF
        </Button>
      </div>

      <div className={styles.sheet}>
        <div className={styles.brand}>
          {store.logoUrl ? (
            <img className={styles.logo} src={store.logoUrl} alt="" />
          ) : (
            <span className={styles.logoPlaceholder}>
              <Icon icon={Store01Icon} size="lg" />
            </span>
          )}
          <h1 className={styles.storeName}>{store.name}</h1>
        </div>
        <p className={styles.headline}>Весь наш ассортимент — в телефоне</p>
        <img className={styles.qr} src={qr} alt={`QR-код витрины ${store.name}`} />
        <p className={styles.instruction}>Наведите камеру телефона на код</p>
        <p className={styles.url}>{publicUrl.replace(/^https?:\/\//, "")}</p>
        {store.address && <p className={styles.address}>{store.address}</p>}
      </div>
    </Page>
  );
}
