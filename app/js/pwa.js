// Registers the service worker, which is what lets Android offer to install
// the app properly instead of dropping a browser shortcut on the home
// screen. See sw.js for why it is written the way it is.
//
// Imported for its side effect by every page's entry module, so there is one
// copy of this decision rather than four.

// Resolved against this module rather than the page so it stays correct
// wherever the app is served from — it sits in a subdirectory on GitHub
// Pages and at the root locally.
const SW = new URL('../sw.js', import.meta.url);

// Service workers need a secure context. Over plain http the API is simply
// absent, so the guard is not defensive noise — it is the local dev server.
if ('serviceWorker' in navigator) {
  // After load: registration competes with the first forecast request for
  // bandwidth otherwise, and the weather is what the person came for.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(SW).catch(() => {
      // Nothing to do and nothing worth saying. The app works without it;
      // only installability and offline are lost.
    });
  });
}
