// Офлайн: все файлы приложения лежат в кэше. Ответ — сразу из кэша, а в фоне файл скачивается заново:
// новая версия появляется при следующем запуске. Поменял файлы — подними VERSION.
const VERSION = "ois-v1";
const FILES = ["./", "index.html", "app.css", "app.js", "data.js", "manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.open(VERSION).then((cache) =>
      cache.match(req, { ignoreSearch: true }).then((hit) => {
        const fresh = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => hit || Response.error());
        if (hit) {
          e.waitUntil(fresh.catch(() => {}));
          return hit;
        }
        return fresh;
      })
    )
  );
});
