import { useCallback, useEffect, useState } from "react";

// Buyers have no accounts: favorites live in this browser, per store.
const EVENT = "favorites-changed";
const key = (storeSlug: string) => `favorites:${storeSlug}`;

function read(storeSlug: string): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(key(storeSlug)) ?? "[]");
    return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function useFavorites(storeSlug: string) {
  const [ids, setIds] = useState<string[]>(() => read(storeSlug));

  useEffect(() => {
    setIds(read(storeSlug));
    // Keep several cards/pages in sync, and other tabs too.
    const sync = () => setIds(read(storeSlug));
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [storeSlug]);

  const toggle = useCallback(
    (productId: string) => {
      const current = read(storeSlug);
      const next = current.includes(productId) ? current.filter((id) => id !== productId) : [productId, ...current];
      try {
        localStorage.setItem(key(storeSlug), JSON.stringify(next));
      } catch {
        // Private mode: favorites last until the page closes.
      }
      setIds(next);
      window.dispatchEvent(new Event(EVENT));
      return next.includes(productId);
    },
    [storeSlug]
  );

  return { ids, has: (productId: string) => ids.includes(productId), toggle };
}
