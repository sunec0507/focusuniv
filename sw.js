const CACHE = "focusuniv-shell-v2";
const PRECACHE = [
  "/",
  "/index.html",
  "/manifest.json",
  "/css/app.css",
  "/js/app.js",
  "/js/store.js",
  "/js/auth.js",
  "/js/util.js",
  "/js/icons.js",
  "/js/vendor/gotrue.js",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/.netlify")) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200 && (response.type === "basic" || request.mode === "navigate")) {
          const copy = response.clone();
          const key = request.mode === "navigate" ? "/index.html" : request;
          caches.open(CACHE).then((cache) => cache.put(key, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => (request.mode === "navigate" ? caches.match("/index.html") : caches.match(request))),
  );
});
