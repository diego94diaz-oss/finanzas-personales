/* Service worker — Mis Finanzas (versión Supabase).
   Cachea solo el shell de la app (same-origin) para que abra rápido y offline.
   Las llamadas a Supabase y a las fuentes (cross-origin) pasan directo a la red. */
const CACHE = "finanzas-sb-v5";
const ASSETS = ["./", "./index.html", "./manifest.json", "./icon.svg", "./datos_cifrados.js"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== location.origin) return;   // Supabase / fuentes: directo a la red
  e.respondWith(
    // "no-store": ignora la caché HTTP del navegador (GitHub Pages manda Cache-Control:
    // max-age=600, que puede servir un index.html viejo aunque el SW pida "red primero"
    // si no se le fuerza a saltarse esa caché intermedia).
    fetch(req, { cache: "no-store" }).then(res => {
      const cp = res.clone();
      caches.open(CACHE).then(c => c.put(req, cp));
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match("./index.html")))
  );
});
