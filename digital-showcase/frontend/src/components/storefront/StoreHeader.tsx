import { Clock01Icon, Location01Icon } from "@hugeicons/core-free-icons";
import type { Store } from "../../types/models";
import { Card, Icon } from "../../ui";
import { mapsUrl } from "../../utils/contact";
import { ContactButtons } from "./Contacts";
import { ShareButton } from "./ShareButton";
import styles from "./StoreHeader.module.css";

/** Top of the storefront: who the store is, where and when, and how to reach it. */
export function StoreHeader({ store }: { store: Store }) {
  const url = `${window.location.origin}/m/${store.slug}`;
  return (
    <Card as="section" padding="lg" className={styles.header} aria-label="О магазине">
      <div className={styles.identity}>
        {store.logoUrl ? (
          <img className={styles.logo} src={store.logoUrl} alt="" />
        ) : (
          <span className={styles.logo} aria-hidden="true">
            {store.name.trim().slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className={styles.text}>
          <h1 className={styles.name}>{store.name}</h1>
          {store.description && <p className={styles.description}>{store.description}</p>}
        </div>
        <ShareButton url={url} title={store.name} className={styles.share} />
      </div>
      {(store.address || store.workingHours) && (
        <ul className={styles.facts}>
          {store.address && (
            <li>
              <Icon icon={Location01Icon} size="sm" />
              <a href={mapsUrl(store.address)} target="_blank" rel="noreferrer">
                {store.address}
              </a>
            </li>
          )}
          {store.workingHours && (
            <li>
              <Icon icon={Clock01Icon} size="sm" />
              <span>{store.workingHours}</span>
            </li>
          )}
        </ul>
      )}
      <ContactButtons layout="adaptive" store={store} storeSlug={store.slug} />
    </Card>
  );
}
