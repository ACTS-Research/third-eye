// Registers the service worker (production builds only) so the page can
// reload without internet. Resolves to a short status for the UI.

export function enableOffline() {
  if (!import.meta.env.PROD) return Promise.resolve('off in the dev server');
  if (!('serviceWorker' in navigator)) return Promise.resolve('not supported by this browser');
  const url = new URL('../sw.js', location.href);
  return navigator.serviceWorker
    .register(url, { scope: new URL('../', location.href).pathname })
    .then(() => navigator.serviceWorker.ready)
    .then(() => 'ready')
    .catch((err) => `unavailable (${err.message})`);
}
