// The live header's trigger (r10), the part of it every page carries: after load, ask the root site
// which nav rev is current and, only when it is not the rev baked into this page, load shell-swap.mjs.
// Any failure (404 off ocx.sh, network, malformed pointer) leaves the baked header as it is.
import { SHELL_DIR, SHELL_HOST } from './shell.mjs';

/**
 * @param {Document} doc
 * @param {HTMLElement} nav the header's navigation-menu root, `data-nav-rev` its baked rev (absent: no live header)
 */
export function syncShell(doc, nav) {
  const win = doc.defaultView;
  if (!win || !nav.dataset['navRev'] || !SHELL_HOST.test(doc.location.hostname)) return;
  const sync = () =>
    fetch(`${SHELL_DIR}current.json`, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((/** @type {{ v?: unknown, rev?: unknown } | null} */ now) =>
        now?.v === 1 && now.rev !== nav.dataset['navRev']
          ? import('./shell-swap.mjs').then((m) => m.swapShell(doc, nav, now.rev))
          : undefined,
      )
      .catch(() => {});
  const run = () => void sync();
  const idle = () =>
    win.requestIdleCallback ? win.requestIdleCallback(run, { timeout: 5000 }) : win.setTimeout(run, 2000);
  if (doc.readyState === 'complete') idle();
  else win.addEventListener('load', idle, { once: true });
}
