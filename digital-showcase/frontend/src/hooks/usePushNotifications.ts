import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { User } from "../types/models";
import { currentSubscription, disablePush, enablePush, pushSupport, syncPush, testPush } from "../utils/push";

/** checking — still asking the browser; denied — blocked in the browser's settings for this site. */
export type PushState = "checking" | "on" | "off" | "denied" | "needs-home-screen" | "unsupported";

async function readState(): Promise<PushState> {
  const support = pushSupport();
  if (support !== "supported") return support;
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "off";
  return (await currentSubscription()) ? "on" : "off";
}

/** Notifications on this phone: what the browser says now, and turning them on and off. */
export function usePushNotifications() {
  const [state, setState] = useState<PushState>("checking");
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    readState()
      .catch((): PushState => "off")
      .then((next) => isCurrent && setState(next));
    return () => {
      isCurrent = false;
    };
  }, []);

  const run = useCallback(async <T,>(action: () => Promise<T>) => {
    setIsBusy(true);
    try {
      return await action();
    } finally {
      setIsBusy(false);
    }
  }, []);

  const enable = useCallback(
    () =>
      run(async () => {
        const next = await enablePush();
        setState(next);
        return next;
      }),
    [run]
  );

  const disable = useCallback(
    () =>
      run(async () => {
        await disablePush();
        setState("off");
      }),
    [run]
  );

  const test = useCallback(
    () =>
      run(async () => {
        const result = await testPush();
        // The push service forgot this phone: it has to be turned on again.
        if (result === "gone") {
          await disablePush().catch(() => undefined);
          setState("off");
        }
        return result;
      }),
    [run]
  );

  return { state, isBusy, enable, disable, test };
}

/**
 * In the header: a tap on a notification opens its page without reloading
 * (public/sw.js asks), and the server learns whose phone this is at sign-in.
 */
export function usePushInApp(user: User | null) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    function onMessage(event: MessageEvent) {
      const link = event.data?.type === "open" ? event.data.link : null;
      if (typeof link === "string" && link.startsWith("/") && !link.startsWith("//")) navigate(link);
    }
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [navigate]);

  const ownerId = user?.role === "OWNER" && !user.impersonatedBy ? user.id : null;
  useEffect(() => {
    if (ownerId) syncPush().catch(() => undefined);
  }, [ownerId]);
}
