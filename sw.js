/* ========================================
   Milano Pepite — Service Worker
   Offline support & caching
   ======================================== */

const CACHE_NAME        = 'pepite-beta-v2';
const SAVED_IMAGES_CACHE = 'pepite-beta-saved-images'; // version-independent, never wiped
const EVENTS_CACHE      = 'pepite-beta-events';        // stale-while-revalidate, never wiped

// App shell — cache-first (does NOT include eventi.json or storie.json — handled separately)
const ASSETS = [
  '/beta/',
  '/beta/index.html',
  '/beta/styles.css',
  '/beta/app.js',
  '/beta/data.json',
  '/beta/manifest.json'
];

// ── Install: cache shell assets ──
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// ── Activate: clean old versioned caches; keep saved-images and events ──
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(k => k !== CACHE_NAME && k !== SAVED_IMAGES_CACHE && k !== EVENTS_CACHE)
            .map(k => caches.delete(k))
        )
      )
      .then(() => self.clients.claim()) // claim only after old caches are gone
  );
});

// ── Message: sync saved pepite image cache ──
self.addEventListener('message', (e) => {
  if (e.data?.type === 'CACHE_SAVED_IMAGES') {
    e.waitUntil(syncSavedImages(e.data.urls || []));
  }
});

async function syncSavedImages(urls) {
  const cache = await caches.open(SAVED_IMAGES_CACHE);
  const existing = await cache.keys();
  const existingUrls = new Set(existing.map(r => r.url));
  const targetUrls = new Set(urls);

  // Add newly saved images
  const toAdd = urls.filter(u => u && !existingUrls.has(u));
  await Promise.all(toAdd.map(async (url) => {
    try {
      const res = await fetch(url, { mode: 'no-cors' });
      if (res) await cache.put(url, res);
    } catch (_) { /* offline or unreachable — skip */ }
  }));

  // Remove images no longer in favourites
  const toRemove = existing.filter(r => !targetUrls.has(r.url));
  await Promise.all(toRemove.map(r => cache.delete(r)));
}

// ── Stale-while-revalidate for storie.json ──
// Serves cached version immediately, silently refreshes in background.
// No client notification needed (stories don't change as frequently as events).
async function staleWhileRevalidateStorie(request) {
  const cache  = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const revalidate = (async () => {
    try {
      const fresh = await fetch(request);
      if (fresh && fresh.status === 200) await cache.put(request, fresh.clone());
    } catch (_) { /* offline — skip */ }
  })();

  if (cached) {
    revalidate.catch(() => {});
    return cached;
  }
  await revalidate;
  return (await cache.match(request)) || fetch(request);
}

// ── Stale-while-revalidate for eventi.json ──
async function staleWhileRevalidateEvents(request) {
  const cache  = await caches.open(EVENTS_CACHE);
  const cached = await cache.match(request);

  // Background revalidation — non-blocking
  const revalidate = (async () => {
    try {
      const fresh = await fetch(request);
      if (!fresh || fresh.status !== 200) return;

      if (cached) {
        // Compare bodies to detect actual data changes
        const [oldText, newText] = await Promise.all([
          cached.clone().text(),
          fresh.clone().text()
        ]);
        if (oldText === newText) return; // no change — skip
        // Data changed: update cache and notify all clients
        await cache.put(request, fresh.clone());
        const clients = await self.clients.matchAll({ includeUncontrolled: true });
        clients.forEach(c => c.postMessage({ type: 'EVENTI_UPDATED' }));
      } else {
        // First time — just cache it
        await cache.put(request, fresh.clone());
      }
    } catch (_) { /* network offline — skip */ }
  })();

  if (cached) {
    // Serve stale immediately; revalidation runs in background
    revalidate.catch(() => {}); // fire-and-forget — suppress unhandled-rejection warnings
    return cached;
  }
  // No cache yet — wait for network (first visit or after cache cleared)
  await revalidate;
  return (await cache.match(request)) || fetch(request);
}

// ── Notification click: focus app and open the event ──
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const eventId = e.notification.data?.eventId;

  e.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(list => {
        // Focus any existing window of this app
        for (const client of list) {
          if ('focus' in client) {
            client.focus();
            if (eventId) client.postMessage({ type: 'OPEN_EVENT', eventId });
            return;
          }
        }
        // No window open — launch the app
        const url = eventId ? `/#evento-${eventId}` : '/';
        if (self.clients.openWindow) return self.clients.openWindow(url);
      })
  );
});

// ── Fetch ──
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);
  const path = url.pathname;

  // Stale-while-revalidate for eventi.json
  if (path.endsWith('/eventi.json') || path === '/eventi.json') {
    e.respondWith(staleWhileRevalidateEvents(e.request));
    return;
  }

  // Stale-while-revalidate for storie.json
  if (path.endsWith('/storie.json') || path === '/storie.json') {
    e.respondWith(staleWhileRevalidateStorie(e.request));
    return;
  }

  // App shell — network-first, falling back to cache when offline.
  // app.js/styles.css are requested with a cache-busting "?v=N" query string that changes
  // on every deploy, but the entries cached at install time have no query string at all.
  // caches.match() does an exact-URL match by default, so it would never find those entries
  // for a versioned request — meaning a plain cache-first strategy here would always miss
  // and hit the network anyway while online, then have *no* fallback at all when offline
  // (the fetch simply fails). Fetching from the network first and only falling back to the
  // cache — ignoring the query string — when that fails gives the same freshness online
  // while actually working offline, and keeps the cache up to date as new versions land.
  if (ASSETS.some(a => path === a || path.endsWith(a.replace(/^\//, '')))) {
    e.respondWith(
      (async () => {
        try {
          const fresh = await fetch(e.request);
          if (fresh && fresh.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(e.request, fresh.clone());
          }
          return fresh;
        } catch (_) {
          const cached = await caches.match(e.request, { ignoreSearch: true });
          if (cached) return cached;
          throw _;
        }
      })()
    );
    return;
  }

  // Everything else: saved-images first, then network-first with general cache fallback
  e.respondWith(
    (async () => {
      const savedCache = await caches.open(SAVED_IMAGES_CACHE);
      const savedHit   = await savedCache.match(e.request);
      if (savedHit) return savedHit;

      try {
        const res = await fetch(e.request);
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      } catch (_) {
        return caches.match(e.request);
      }
    })()
  );
});
