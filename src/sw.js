// Service worker: lets every page reload with no internet at all.
//
// - The app itself (pages, scripts, styles, fonts) is stored when the worker
//   installs, so a single visit online is enough.
// - Pages are fetched from the network when it answers quickly, so a new
//   deploy is picked up; otherwise the stored copy is used.
// - Big optional files (MediaPipe runtime and models) are stored the first
//   time a feature uses them.
//
// The two placeholders below are filled in by the build (vite.config.js).

const PRECACHE = __PRECACHE__;
const VERSION = '__VERSION__';
const CACHE = 'third-eye-cam';
const PAGE_TIMEOUT_MS = 2500;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((path) => new Request(new URL(path, self.registration.scope), { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      // Drop scripts from older builds, but only when no window is open: a
      // page loaded before this update may still need its own files.
      const windows = await self.clients.matchAll({ type: 'window' });
      if (windows.length) return;
      const cache = await caches.open(CACHE);
      const keep = new Set(PRECACHE.map((path) => new URL(path, self.registration.scope).href));
      for (const request of await cache.keys()) {
        if (request.url.includes('/assets/') && !keep.has(request.url)) await cache.delete(request);
      }
    })(),
  );
});

const isPage = (request) => request.mode === 'navigate' || request.destination === 'document';

async function fromNetwork(request, cache) {
  const response = await fetch(request);
  if (response.ok && response.status === 200) cache.put(request, response.clone());
  return response;
}

async function respond(request) {
  const cache = await caches.open(CACHE);
  // ignoreVary: scripts are requested with an Origin header the stored copy
  // was not fetched with; the files are the same either way.
  const stored = await cache.match(request, { ignoreSearch: isPage(request), ignoreVary: true });

  if (isPage(request)) {
    // Network first, but never keep a performer waiting on a dead link.
    try {
      return await Promise.race([
        fromNetwork(request, cache),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), stored ? PAGE_TIMEOUT_MS : 30000)),
      ]);
    } catch (err) {
      if (stored) return stored;
      throw err;
    }
  }
  // Everything else is content-addressed or versioned: stored copy wins.
  return stored ?? fromNetwork(request, cache);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  if (request.method === 'HEAD') {
    // "Is this file there?" must also work offline.
    event.respondWith(
      fetch(request).catch(async () => {
        const hit = await (await caches.open(CACHE)).match(request.url, { ignoreVary: true });
        return new Response(null, { status: hit ? 200 : 504 });
      }),
    );
    return;
  }
  if (request.method !== 'GET' || request.headers.has('range')) return;
  event.respondWith(respond(request));
});

self.addEventListener('message', (event) => {
  if (event.data === 'version') event.source?.postMessage({ swVersion: VERSION });
});
