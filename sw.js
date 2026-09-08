/* Service worker — Mis Finanzas (versión Supabase).
   Cachea el shell de la app (same-origin) para que abra rápido y offline.
   Las llamadas a Supabase y a las fuentes (cross-origin) pasan directo a la red,
   salvo el lector de Excel, que se cachea aparte para poder cargar cartolas sin
   conexión. */
const CACHE = "finanzas-sb-v8";
const ASSETS = ["./", "./index.html", "./manifest.json", "./icon.svg", "./datos_cifrados.js",
  "./cartolas.js", "./cartolas_ui.js"];

// Librería externa (lee .xlsx y el .xls binario de Falabella). Se cachea "best
// effort" y FUERA de addAll: si el CDN falla, la instalación del SW no debe
// romperse — la app sigue funcionando y solo la pestaña Cartolas necesitaría
// conexión la próxima vez.
const EXTERNOS = ["https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS).then(() =>
        Promise.all(EXTERNOS.map(u => c.add(u).catch(() => null)))))
      .then(() => self.skipWaiting())
  );
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

  // Lector de Excel: caché primero, red como respaldo (así funciona offline).
  if (EXTERNOS.some(u => req.url.startsWith(u))) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        const cp = res.clone();
        caches.open(CACHE).then(c => c.put(req, cp));
        return res;
      }))
    );
    return;
  }

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
