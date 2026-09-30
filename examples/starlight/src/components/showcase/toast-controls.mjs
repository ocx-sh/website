// Wiring for ToastControls.astro: each button calls the public toast() API on itself, so the
// Demo's EventLog (which watches for `ocx:*` dispatched on or inside its target) picks up
// `ocx:toast` the same way it would from real app code.
import { toast } from '@ocx-sh/theme/toast';

// Demo toasts go after 1 s (the library default is 2.5 s): a reviewer clicking through the tones
// should not wait for a stack to drain. Persistent, action and loading/promise demos keep their own
// lifetimes: those are what they show.
const DEMO = { duration: 1000 };

/** @param {number} ms */
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/** @type {Record<string, (button: HTMLElement) => void>} */
const actions = {
  info: (el) => void toast('Heads up', { ...DEMO, tone: 'info' }, el),
  success: (el) => void toast('Saved', { ...DEMO, tone: 'success' }, el),
  warning: (el) => void toast('Running low on disk space', { ...DEMO, tone: 'warning' }, el),
  error: (el) => void toast('Something broke', { ...DEMO, tone: 'error' }, el),
  description: (el) => void toast('Deployed', { ...DEMO, description: 'Build 482 is live on ocx.sh.' }, el),
  action: (el) => void toast('File deleted', { action: { label: 'Undo', event: 'ocx:toast-demo:undo' } }, el),
  persistent: (el) =>
    void toast('Reconnecting…', { tone: 'warning', persistent: true, id: 'toast-demo-reconnect' }, el),
  'dismiss-persistent': (el) => toast.dismiss('toast-demo-reconnect', el),
  promise: (el) =>
    void toast.promise(
      delay(1500).then(() => 'ocx.lock'),
      { loading: 'Uploading…', success: (f) => `Uploaded ${f}`, error: 'Upload failed' },
      el,
    ),
  'promise-error': (el) =>
    void toast
      .promise(
        delay(1500).then(() => Promise.reject(new Error('network'))),
        { loading: 'Uploading…', success: 'Uploaded', error: 'Upload failed' },
        el,
      )
      .catch(() => {}), // shown as an error toast already; nothing else to do with it here
  update: (el) => {
    toast('Job started', { id: 'toast-demo-job', tone: 'loading', persistent: true }, el);
    void delay(1500).then(() => toast('Job complete', { id: 'toast-demo-job', tone: 'success' }, el));
  },
  stack: (el) => {
    const tones = /** @type {const} */ (['info', 'success', 'warning', 'error', 'info']);
    tones.forEach((tone, i) => toast(`Toast ${i + 1}`, { ...DEMO, tone }, el));
  },
};

document.addEventListener('click', (event) => {
  const button = /** @type {Element | null} */ (event.target)?.closest?.('[data-toast]');
  const key = button instanceof HTMLElement ? button.dataset['toast'] : undefined;
  if (key && key in actions) actions[key]?.(/** @type {HTMLElement} */ (button));
});
