import { useEffect, useState } from "react";

// Remembers (per browser) that the owner has shared the store link — the last
// step of the launch checklist. Copy, QR and poster all count.

const EVENT = "store-link-shared";
const key = (storeId: string) => `store-shared:${storeId}`;

function readShared(storeId: string) {
  try {
    return localStorage.getItem(key(storeId)) === "1";
  } catch {
    return false;
  }
}

export function markStoreShared(storeId: string) {
  try {
    localStorage.setItem(key(storeId), "1");
  } catch {
    // Private mode: the checklist just won't remember it.
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: storeId }));
}

export function useStoreShared(storeId: string) {
  const [isShared, setIsShared] = useState(() => readShared(storeId));

  useEffect(() => {
    setIsShared(readShared(storeId));
    function onShared(event: Event) {
      if ((event as CustomEvent<string>).detail === storeId) setIsShared(true);
    }
    window.addEventListener(EVENT, onShared);
    return () => window.removeEventListener(EVENT, onShared);
  }, [storeId]);

  return isShared;
}
