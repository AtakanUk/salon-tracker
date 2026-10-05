/**
 * Keeps the installed app (the icon on the home screen) from serving a version
 * we replaced weeks ago.
 *
 * The service worker precaches the whole shell, so after a deploy the phone
 * keeps painting the old screens until two separate things happen: the new
 * worker installs, and the page reloads. Nothing here used to do the second
 * one. Worse, an installed app resumed from the app switcher never fires
 * `load`, so it would not even look for a new version - a fix could be live on
 * the server for days while the phone still showed the broken screen.
 */

/**
 * How long after a screen opens a reload is still free: nobody has typed into
 * a form yet, so swapping the page under them costs nothing. Later than this
 * we wait, because an employee could be halfway through a customer's entry.
 */
const STARTUP_MS = 10_000;

let pending = false; // a newer version took over; this page has not reloaded yet
let reloading = false;
let openedAt = Date.now();

function applyUpdate() {
  if (reloading) return;
  reloading = true;
  location.reload();
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  // The worker calls clientsClaim(), so this fires as soon as a new version
  // takes over - while the page itself is still running the old code.
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true; // first ever install: there is nothing to replace
      return;
    }
    if (Date.now() - openedAt < STARTUP_MS) return applyUpdate();
    pending = true;
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState !== 'visible') return;
          // coming back to a version that is already stale: take it now, while
          // the screen is being reopened anyway and nothing is half-typed
          if (pending) return applyUpdate();
          // an installed app resumed from the app switcher gives us no other
          // signal, so this is where the update check has to live
          openedAt = Date.now();
          reg.update().catch(() => {});
        });
      })
      .catch(() => {
        // no worker means no offline shell; the app still works over the network
      });
  });
}
