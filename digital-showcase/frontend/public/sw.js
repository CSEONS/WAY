// Notifications on the owner's phone (backend/src/services/pushService.ts).
// Registered only when the owner turns them on; it doesn't touch requests,
// so the site works the same with or without it.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    message = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(message.title || "Витрины", {
        body: message.body || "",
        icon: "/icons/icon-192.png",
        lang: "ru",
        // Same topic as in the bell: the newer one replaces the older, and still rings.
        tag: message.tag || undefined,
        renotify: Boolean(message.tag),
        data: { link: message.link || "/dashboard" }
      });
      // An open cabinet refreshes its bell.
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) client.postMessage({ type: "notification" });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/dashboard";
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) {
        try {
          // The app opens the page itself, without reloading.
          await open.focus();
          open.postMessage({ type: "open", link });
          return;
        } catch {
          // Not allowed to bring it forward: a new window instead.
        }
      }
      await self.clients.openWindow(link);
    })()
  );
});
