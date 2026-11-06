const CACHE = 'kinship-shell-' + BUILD_ID;
const ASSETS = new Set(PRECACHE);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache =>
    cache.addAll(PRECACHE.map(path => new Request(path, { cache: 'reload' }))),
  ));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('kinship-shell-') && key !== CACHE)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate' && url.pathname === '/') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.status < 500) return response;
      } catch { /* The shell is already precached. */ }
      const shell = await (await caches.open(CACHE)).match('/index.html');
      if (!shell) return Response.error();
      // A network outage can happen even when navigator.onLine reports true.
      const html = (await shell.text()).replace('<html', '<html data-offline-shell');
      return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    })());
  } else if (!url.search && ASSETS.has(url.pathname)) {
    event.respondWith((async () => (await (await caches.open(CACHE)).match(url.pathname)) ?? fetch(request))());
  }
});
