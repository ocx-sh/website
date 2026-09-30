// Wiring for ToastProgressControls.astro: a loading toast whose ring advances by id, one update per
// step, then settles to success in place. Each call passes only what changes (title and progress).
import { toast } from '@ocx-sh/theme/toast';

const ID = 'toast-demo-progress';
const STEP_MS = 600;
const STEPS = [0, 25, 50, 75, 100];

/** @param {HTMLElement} el */
function run(el) {
  STEPS.forEach((progress, i) => {
    setTimeout(() => {
      if (i === 0) toast('Uploading ocx.lock', { id: ID, tone: 'loading', persistent: true, progress }, el);
      else toast(`Uploading ocx.lock (${progress}%)`, { id: ID, progress }, el);
    }, i * STEP_MS);
  });
  setTimeout(() => toast('Uploaded ocx.lock', { id: ID, tone: 'success' }, el), STEPS.length * STEP_MS);
}

document.addEventListener('click', (event) => {
  const button = /** @type {Element | null} */ (event.target)?.closest?.('[data-toast-progress]');
  if (button instanceof HTMLElement) run(button);
});
