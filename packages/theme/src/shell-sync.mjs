// The live header's trigger (r10), the part of it every page carries: after load, and only on a host that
// serves the root site's `/_shell/`, load shell-swap.mjs, which waits for idle, asks which nav rev is current and swaps it
// in when it is not the one baked into this page. Kept to this stub because every page ships it.

/** Hosts that serve `/_shell/`; elsewhere (localhost, CI previews) the loader stays off, so no 404 reaches the console. Defined here, not in shell.mjs, so the lazy chunk's constants stay out of the every-page one. */
export const SHELL_HOST = /(?:^|\.)ocx\.sh$/;

/**
 * @param {Document} doc
 * @param {HTMLElement} nav the header's navigation-menu root, `data-nav-rev` its baked rev (absent: no live header)
 */
export function syncShell(doc, nav) {
  if (!nav.dataset['navRev'] || !SHELL_HOST.test(doc.location.hostname)) return;
  const go = () => void import('./shell-swap.mjs').then((m) => m.syncLive(doc, nav));
  if (doc.readyState === 'complete') go();
  else doc.defaultView?.addEventListener('load', go, { once: true });
}
