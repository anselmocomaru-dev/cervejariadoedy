const CACHE = "edy-pwa-v8";
const SHELL = ["/pwa/styles.css", "/pwa/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function networkFirst(request) {
  return fetch(request)
    .then((res) => {
      if (res.ok) {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(request, clone));
      }
      return res;
    })
    .catch(() => caches.match(request));
}

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname === "/cliente" || url.pathname.startsWith("/pwa/")) {
    e.respondWith(networkFirst(e.request));
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
