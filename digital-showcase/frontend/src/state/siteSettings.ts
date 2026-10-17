import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { SiteSettings } from "../types/models";

// Plans, contacts, help videos and requisites from the admin panel. Loaded
// once per page load and shared by every screen that asks; a save in the
// admin panel refreshes them everywhere without a reload.

let current: SiteSettings | undefined;
let loading: Promise<SiteSettings> | null = null;
const listeners = new Set<(value: SiteSettings) => void>();

function publish(value: SiteSettings) {
  current = value;
  for (const listener of listeners) listener(value);
}

function load() {
  loading ??= api
    .get<SiteSettings>("/public/site")
    .then((res) => {
      publish(res.data);
      return res.data;
    })
    .catch((error) => {
      loading = null;
      throw error;
    });
  return loading;
}

/** Undefined while loading, null when the server didn't answer. */
export function useSiteSettings() {
  const [value, setValue] = useState<SiteSettings | null | undefined>(current);
  useEffect(() => {
    listeners.add(setValue);
    if (!current) load().catch(() => setValue(null));
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}

/** After a save in the admin panel: fetch again, everyone gets the new values. */
export function refreshSiteSettings() {
  loading = null;
  load().catch(() => undefined);
}
