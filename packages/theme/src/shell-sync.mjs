// The live header's trigger (r10), the part of it every page carries: after load, ask the root site
// which nav rev is current and, only when it is not the rev baked into this page, load shell-swap.mjs.
// Any failure (404 off ocx.sh, network, malformed pointer) leaves the baked header as it is.
import { SHELL_DIR, SHELL_HOST, SHELL_REV } from './shell.mjs';

/**
 * @param {Document} doc
 * @param {HTMLElement} header the `.ocx-header[data-nav-rev]` root
 * @param {HTMLElement} nav the header's navigation-menu root
 * @param {import('./shell-swap.mjs').Mounts} mounts how to stop and re-arm the nav's lazy machine
 */
export function syncShell(doc, header, nav, mounts) {
  const win = doc.defaultView;
  if (!win || !SHELL_HOST.test(doc.location.hostname)) return;
  const sync = () =>
    fetch(`${SHELL_DIR}current.json`, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((/** @type {{ v?: unknown, rev?: unknown } | null} */ now) => {
        const rev = now?.rev;
        if (now?.v !== 1 || typeof rev !== 'string' || !SHELL_REV.test(rev) || rev === header.dataset['navRev']) return;
        return import('./shell-swap.mjs').then((m) => m.swapShell(doc, header, nav, rev, mounts));
      })
      .catch(() => {});
  const run = () => void sync();
  const idle = () =>
    win.requestIdleCallback ? win.requestIdleCallback(run, { timeout: 5000 }) : win.setTimeout(run, 2000);
  if (doc.readyState === 'complete') idle();
  else win.addEventListener('load', idle, { once: true });
}
