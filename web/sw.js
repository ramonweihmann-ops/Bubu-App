// Haus-Quest – Service Worker.
// Hält die Hülle der App offline verfügbar. Daten kommen immer frisch aus dem Netz;
// gemeldete Quests werden vom Worker nachgereicht, wenn wieder Empfang da ist.

const CACHE = "hq-shell-v9";
const HUELLE = ["/", "/app/", "/app/app.css", "/app/app.js", "/logo.webp", "/cleanie.webp",
                "/manifest.webmanifest", "/icons/icon-192.png"];

self.addEventListener("install", (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(HUELLE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (ev) => {
  const url = new URL(ev.request.url);
  if (ev.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) return;            // Daten nie aus dem Zwischenspeicher

  ev.respondWith(
    fetch(ev.request)
      .then((antwort) => {
        const kopie = antwort.clone();
        caches.open(CACHE).then((c) => c.put(ev.request, kopie));
        return antwort;
      })
      .catch(() => caches.match(ev.request).then((treffer) => treffer || caches.match("/app")))
  );
});

// Belohnungsmoment: Push landet auch bei geschlossener App.
self.addEventListener("push", (ev) => {
  const daten = ev.data ? ev.data.json() : {};
  ev.waitUntil(self.registration.showNotification(daten.titel || "Haus-Quest", {
    body: daten.text || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: daten.url || "/app" },
    tag: daten.tag
  }));
});

self.addEventListener("notificationclick", (ev) => {
  ev.notification.close();
  ev.waitUntil(clients.openWindow(ev.notification.data.url));
});
