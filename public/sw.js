/* ═══════════════════════════════════════════════════════════════════════════
 * منصة التعليم الذكية — Offline-First Service Worker
 *
 * Caching strategy:
 *  • App shell (HTML / JS / CSS)  → Network-first + cache fallback
 *  • Google Fonts                 → Cache-first (stale-while-revalidate)
 *  • Images / icons / SVG         → Cache-first
 *  • /api/sync/*                  → BYPASS (sync engine manages this)
 *  • Curriculum PDFs & voice      → BYPASS (stored directly in IndexedDB)
 * ═══════════════════════════════════════════════════════════════════════════ */

const CACHE_VERSION  = "v2";
const CACHE_APP      = `ome-app-${CACHE_VERSION}`;
const CACHE_STATIC   = `ome-static-${CACHE_VERSION}`;
const CACHE_FONTS    = `ome-fonts-${CACHE_VERSION}`;
const ALL_CACHES     = [CACHE_APP, CACHE_STATIC, CACHE_FONTS];

/* ── Install: precache the app shell ─────────────────────────────────────── */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_APP).then((cache) =>
      /* Cache the scope root — on first load Vite serves index.html here */
      cache.addAll([self.registration.scope]).catch(() => {
        /* Graceful: don't fail SW install if precache misses */
      }),
    ).then(() => self.skipWaiting()),
  );
});

/* ── Activate: purge stale caches ────────────────────────────────────────── */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !ALL_CACHES.includes(k))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/* ── Fetch: route by strategy ────────────────────────────────────────────── */
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  /* Only handle GET requests */
  if (request.method !== "GET") return;

  /* ── BYPASS: Sync API — handled by HybridSyncEngine ── */
  if (url.pathname.includes("/api/")) return;

  /* ── BYPASS: Vite HMR & Replit internal traffic ── */
  if (
    url.pathname.includes("/@vite") ||
    url.pathname.includes("/__repl") ||
    url.pathname.includes("/@fs") ||
    url.pathname.includes("/node_modules")
  ) return;

  /* ── BYPASS: WebSocket upgrades (Vite HMR) ── */
  if (request.headers.get("upgrade") === "websocket") return;

  /* ── Google Fonts → Cache-first ── */
  if (
    url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com"
  ) {
    event.respondWith(cacheFirst(request, CACHE_FONTS));
    return;
  }

  /* ── Static assets (images, icons, fonts, svg) → Cache-first ── */
  if (/\.(png|jpg|jpeg|webp|svg|ico|woff2?|ttf|eot)(\?.*)?$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request, CACHE_STATIC));
    return;
  }

  /* ── JS / CSS bundles → Stale-While-Revalidate ── */
  if (/\.(js|css)(\?.*)?$/.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, CACHE_APP));
    return;
  }

  /* ── Navigation requests (HTML) → Network-first with offline fallback ── */
  if (request.mode === "navigate") {
    event.respondWith(networkFirstWithFallback(request, CACHE_APP));
    return;
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
 * Strategy helpers
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Cache-first: serve from cache; fetch & store if missing. */
async function cacheFirst(request, cacheName) {
  const cache    = await caches.open(cacheName);
  const cached   = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return new Response("Offline", { status: 503, statusText: "Service Unavailable" });
  }
}

/** Stale-while-revalidate: serve cache immediately, update in background. */
async function staleWhileRevalidate(request, cacheName) {
  const cache    = await caches.open(cacheName);
  const cached   = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached); /* network failed — the cached result was already returned */

  return cached ?? fetchPromise;
}

/** Network-first: try network; fall back to cache; show offline page last. */
async function networkFirstWithFallback(request, cacheName) {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;

    /* Serve a minimal offline shell so the app "opens" even with stale cache */
    return new Response(offlineFallbackHtml(), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
}

/** Minimal offline fallback page — Arabic RTL. */
function offlineFallbackHtml() {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>منصة التعليم الذكية — غير متصل</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Tajawal',system-ui,sans-serif;background:#0f1117;color:#e2e8f0;
         display:flex;flex-direction:column;align-items:center;justify-content:center;
         min-height:100vh;text-align:center;padding:24px;gap:16px}
    .icon{font-size:72px;line-height:1}
    h1{font-size:24px;font-weight:800;color:#c084fc}
    p{font-size:14px;color:#94a3b8;max-width:340px}
    button{margin-top:8px;padding:10px 24px;background:#7c3aed;color:#fff;
           border:none;border-radius:8px;font-size:14px;cursor:pointer;font-family:inherit}
  </style>
</head>
<body>
  <div class="icon">📴</div>
  <h1>أنت غير متصل بالإنترنت</h1>
  <p>محتواك المحلي محفوظ وجاهز. عُد عند توفر الاتصال لمزامنة أحدث المواد.</p>
  <button onclick="location.reload()">إعادة المحاولة</button>
</body>
</html>`;
}

/* ── Background Sync: flush push queue when connectivity returns ──────────── */
self.addEventListener("sync", (event) => {
  if (event.tag === "ome-sync-flush") {
    /* The HybridSyncEngine handles flushing — we just notify clients */
    event.waitUntil(
      self.clients.matchAll().then((clients) =>
        clients.forEach((client) =>
          client.postMessage({ type: "BACKGROUND_SYNC_READY" }),
        ),
      ),
    );
  }
});

/* ── Push notifications (future) ─────────────────────────────────────────── */
self.addEventListener("push", (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title ?? "منصة التعليم الذكية", {
      body:   data.body   ?? "تحديث جديد متاح",
      icon:   "./icons/icon-192.svg",
      badge:  "./icons/icon-192.svg",
      dir:    "rtl",
      lang:   "ar",
      tag:    "ome-update",
      renotify: false,
    }),
  );
});
