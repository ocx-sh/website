// CommandPalette, the lazy half: loaded by command-palette.mjs on the first open. Owns the dialog
// machine's mount, the open/close bookkeeping (what gets focus back, `aria-expanded` on the trigger) and
// the search session (command-palette-session.mjs). The eager half queues every open behind `attach`.
import { mount } from './zag.mjs';

/**
 * @typedef {object} Live
 * @property {(open: boolean | undefined, opener: Element | null) => Promise<boolean>} setOpen `open` omitted: toggle; false once the start has failed
 * @property {() => void} destroy
 */

/**
 * Starts the palette in `root`.
 * @param {HTMLElement} root
 * @param {import('./command-palette.mjs').PaletteOptions} options
 * @returns {Live}
 */
export function attach(root, options) {
  const trigger = /** @type {HTMLElement} */ (root.querySelector('[data-cmdpalette-trigger]'));
  const handle = mount(root, { trigger: 'manual', load: () => import('./dialog.zag.mjs') });
  /** @type {{ stop: () => void } | undefined} */
  let session;
  let failed = false;
  let destroyed = false;
  /** @type {HTMLElement | undefined} what had focus before the palette opened: closing returns focus there */
  let opener;
  /** @type {Promise<void> | undefined} */
  let ready;
  const dialog = () => /** @type {{ open: boolean, setOpen: (open: boolean) => void } | undefined} */ (handle.api);

  const live = () =>
    (ready ??= Promise.all([handle.start(), import('./command-palette-session.mjs')])
      .then(([, mod]) => {
        if (destroyed) return;
        session = mod.startSession(root, options.source, (open) => dialog()?.setOpen(open));
        if (!dialog()) throw new Error('the dialog did not start');
      })
      .catch((error) => {
        if (destroyed) return;
        failed = true;
        console.error('[ocx] CommandPalette failed to start', root, error);
      }));
  const onChange = (/** @type {Event} */ event) => {
    if (event.target !== root) return;
    const { open } = /** @type {CustomEvent<{ open: boolean }>} */ (event).detail;
    // After the machine's own focus handling (the trap releases on the frame after the close).
    if (!open)
      requestAnimationFrame(() => {
        if (opener?.isConnected && opener !== document.body) opener.focus();
      });
    trigger.setAttribute('aria-expanded', String(open));
  };
  root.addEventListener('ocx:dialog:change', onChange);

  return {
    async setOpen(open, from) {
      // The trigger is no Zag trigger part, so the machine has no element to give focus back to.
      if (!dialog()?.open) opener = from instanceof HTMLElement ? from : undefined;
      await live();
      if (destroyed) return false;
      const d = dialog();
      // A half-started palette (the search chunk failed) would open an empty, dead dialog.
      if (!failed && d) d.setOpen(open ?? !d.open);
      return !failed;
    },
    destroy() {
      destroyed = true;
      root.removeEventListener('ocx:dialog:change', onChange);
      session?.stop();
      handle.destroy();
    },
  };
}
