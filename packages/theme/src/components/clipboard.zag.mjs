// CopyButton behaviour (C-180) on Zag clipboard, loaded by `mount` on first interaction.
import * as clipboard from '@zag-js/clipboard';
import { toastCopy, writeClipboard } from './copy.mjs';
import { emit } from './ui/zag-runtime.mjs';

// Zag's own write drops `writeText`'s promise: a refused write would be an unhandled rejection
// and still flip to `copied`. The trigger writes itself (`copy` below) and only then sends COPY.
// A COPY while `copied` is a re-entry (D-166): Zag's own self-transition keeps the running timer,
// so a second copy 1 s into the window would revert to idle 0.5 s later; reentering restarts it.
const impl = clipboard.machine.implementations;
const { idle, copied } = clipboard.machine.states;
const on = /** @type {Record<string, object>} */ (copied.on ?? {});
/** @type {clipboard.Machine} */
export const machine = {
  ...clipboard.machine,
  states: { idle, copied: { ...copied, on: { ...on, COPY: { ...on['COPY'], reenter: true } } } },
  implementations: { ...impl, actions: { ...impl?.actions, copyToClipboard() {} } },
};
/** @type {typeof clipboard.connect} */
export const connect = clipboard.connect;

/**
 * Trigger props, named after the label when there is one: a page with several buttons would
 * otherwise read "Copy to clipboard" for each. Shared by SSR and `render` (C-130a).
 * @param {clipboard.Api} api
 * @param {string | undefined} label
 */
export function triggerProps(api, label) {
  const props = api.getTriggerProps();
  return label ? { ...props, 'aria-label': `${api.copied ? 'Copied' : 'Copy'} ${label}` } : props;
}

/**
 * @param {clipboard.Api} api
 * @param {HTMLElement} root
 * @param {import('./ui/zag.mjs').Spread} spread
 */
export function render(api, root, spread) {
  spread(root, api.getRootProps());
  const trigger = root.querySelector('[data-part="trigger"]');
  if (trigger) spread(trigger, { ...triggerProps(api, root.dataset.label), onclick: () => void copy(api, root) });
  const [idle, done] = root.querySelectorAll('[data-part="indicator"]');
  if (idle) spread(idle, api.getIndicatorProps({ copied: false }));
  if (done) spread(done, api.getIndicatorProps({ copied: true }));
}

/** Writes the value; never throws (C-180, D-084). @param {clipboard.Api} api @param {HTMLElement} root */
async function copy(api, root) {
  const { value } = api;
  const ok = await writeClipboard(value);
  if (ok) api.copy();
  emit(root, 'clipboard', ok ? 'copy' : 'error', { value });
  toastCopy(root, ok, root.dataset.label ?? value);
}
