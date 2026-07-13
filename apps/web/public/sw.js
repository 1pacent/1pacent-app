/**
 * 1Pacent Pulse service worker: push + one-tap moment actions.
 * The payload is delivery, not state — every screen refetches its scoped
 * projection from the server, so a stale notification can never lie about
 * money or status.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "1Pacent", body: event.data ? event.data.text() : "" };
  }
  const { title = "1Pacent", body = "", url = "/p", actUrl = null, actions = [], tag } = data;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: tag || undefined,
      renotify: Boolean(tag),
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url, actUrl },
      actions: actions.slice(0, 2),
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  const { url, actUrl } = event.notification.data || {};
  event.notification.close();

  // A tapped action button IS the decision — the signed single-use token
  // executes it server-side; the ledger records the human actor.
  if (event.action && actUrl) {
    event.waitUntil(
      fetch(actUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ choice: event.action }),
      })
        .then((res) => res.json().catch(() => ({})))
        .then((result) =>
          self.registration.showNotification(
            result && result.ok ? "Done ✓" : "That didn't work",
            {
              body: result && (result.label || result.error) ? result.label || result.error : "",
              icon: "/icon-192.png",
              tag: event.notification.tag || undefined,
            },
          ),
        )
        .catch(() =>
          self.registration.showNotification("You're offline", {
            body: "Open the app to decide.",
            icon: "/icon-192.png",
          }),
        ),
    );
    return;
  }

  // Body tap: open (or focus) the app at the moment's screen.
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(url || "/p");
          return client.focus();
        }
      }
      return self.clients.openWindow(url || "/p");
    }),
  );
});
