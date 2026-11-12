/* Count It service worker: keeps a copy of the app on the device so it opens in a gym with no signal.

   Only the published (encrypted) copy uses this; lock.py puts it in site/. The page it saves is the sign-in page
   with the app encrypted inside, so nothing readable is stored. Opening the app always uses the saved copy at
   once, then fetches the latest in the background for next time, so a slow connection never holds you up. */
const CACHE = 'countit-shell-v1';
const SHELL = ['./', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
const ROOT = new URL('./', self.location.href).pathname;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {}))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.indexOf('countit-') === 0 && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.indexOf(ROOT) !== 0) return;
  const page = req.mode === 'navigate';
  const key = page ? './' : req; // every way of opening the app is the same page
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(key, { ignoreSearch: true });
    const before = page && cached ? await cached.clone().text() : null;
    const fresh = fetch(page ? './' : req, { cache: 'no-cache' }).then(async (res) => {
      if (!res || !res.ok) return res;
      const copy = res.clone();
      if (before !== null && before !== await res.clone().text()) {
        // A newer build was published. It's saved for next time; tell any open copy so Home can offer a reload.
        const clients = await self.clients.matchAll({ type: 'window' });
        clients.forEach((c) => c.postMessage({ type: 'countit-update' }));
      }
      await cache.put(key, copy);
      return res;
    });
    if (cached) { e.waitUntil(fresh.catch(() => {})); return cached; }
    return fresh.catch(() => new Response("Count It isn't saved on this device yet. Open it once with a connection, then it works offline.",
      { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
  })());
});
