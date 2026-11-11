// Registers the service worker (production builds only) so the page can
// reload without internet. Resolves to a short status for the UI.

// `onUpdate` is called when a newer version of the site has been downloaded
// while this page was open.
export function enableOffline(onUpdate) {
  if (!import.meta.env.PROD) return Promise.resolve('off in the dev server');
  if (!('serviceWorker' in navigator)) return Promise.resolve('not supported by this browser');
  const url = new URL('../sw.js', location.href);
  return navigator.serviceWorker
    .register(url, { scope: new URL('../', location.href).pathname })
    .then((registration) => {
      const hadOne = !!navigator.serviceWorker.controller;
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'activated' && hadOne) onUpdate?.();
        });
      });
      // Look for a new version now and then, not only on page load.
      setInterval(() => registration.update().catch(() => {}), 10 * 60 * 1000);
      return navigator.serviceWorker.ready;
    })
    .then(() => 'ready')
    .catch((err) => `unavailable (${err.message})`);
}
