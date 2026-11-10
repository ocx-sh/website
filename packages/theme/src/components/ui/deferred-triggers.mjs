// When a Deferred box starts (Deferred.astro wires them): at idle after load, at the visitor's first input, or when a
// Tabs panel is shown. Kept apart from lazy.mjs, which every page loads and none of this belongs in.

/**
 * The events that count as the visitor's first input. No `scroll`: every scroll gesture (wheel, touch, key, scrollbar
 * drag) is one of these, and a scroll the browser makes alone is not input. `focusin` is a screen reader's or keyboard
 * user's move. Not lazy.mjs's `ANY_INPUT` list: that one (`idle`) also takes a bare `pointerover`, which a resting cursor
 * fires after layout, to start something small early; this one holds back below-the-fold content until a real gesture.
 */
const INPUT = ['wheel', 'keydown', 'pointermove', 'pointerdown', 'touchstart', 'focusin'];

/** One passive listener set serves every `input` box: the first input starts them all, then it is gone. @type {Set<() => void>} */
const waiting = new Set();
/** A box that arrives after the first input starts at once. */
let heard = false;

/** @param {Event} event */
const onInput = (event) => {
  // The browser fakes a zero-movement pointermove after layout under a resting cursor: not input.
  if (
    event.type === 'pointermove' &&
    !(/** @type {PointerEvent} */ (event).movementX) &&
    !(/** @type {PointerEvent} */ (event).movementY)
  )
    return;
  heard = true;
  for (const type of INPUT) window.removeEventListener(type, onInput, true);
  for (const start of waiting) start();
  waiting.clear();
};

/**
 * Calls `start` at the first input anywhere, or at once if that already happened.
 * @param {() => void} start
 */
export function whenInput(start) {
  if (heard) return start();
  if (!waiting.size) for (const type of INPUT) window.addEventListener(type, onInput, { capture: true, passive: true });
  waiting.add(start);
}

/**
 * Calls `start` once `panel` (a Tabs panel, `hidden` until picked) is not hidden, at once if it already isn't.
 * @param {HTMLElement} panel
 * @param {() => void} start
 */
export function whenShown(panel, start) {
  if (!panel.hidden) return start();
  const watch = new MutationObserver(() => {
    if (panel.hidden) return;
    watch.disconnect();
    start();
  });
  watch.observe(panel, { attributes: true, attributeFilter: ['hidden'] });
}

/** Any of these before the load event's idle slot starts an `idle` box: a visitor who types first must not wait. */
const ANY_INPUT = ['pointerover', 'focusin', 'touchstart', 'keydown'];

/**
 * Calls `start` once the page has loaded and the browser is idle, or at the first of ANY_INPUT.
 * @param {() => void} start
 */
export function whenIdle(start) {
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    for (const type of ANY_INPUT) window.removeEventListener(type, go, true);
    window.removeEventListener('load', onLoad);
    start();
  };
  const onLoad = () => void (window.requestIdleCallback ?? setTimeout)(go);
  for (const type of ANY_INPUT) window.addEventListener(type, go, { capture: true, passive: true });
  if (document.readyState === 'complete') onLoad();
  else window.addEventListener('load', onLoad, { once: true });
}

/**
 * The tab panel a `panel` box waits for, or null: an `idle` or `input` box, or a `panel` box outside a panel (which acts as `idle`).
 * @param {HTMLElement} root a `[data-ocx-deferred]` box
 * @returns {HTMLElement | null}
 */
export const panelOf = (root) => (root.dataset['trigger'] === 'panel' ? root.closest('[role="tabpanel"]') : null);

/**
 * Calls `start` when the box's own trigger fires.
 * @param {HTMLElement} root
 * @param {() => void} start
 */
export function arm(root, start) {
  const panel = panelOf(root);
  if (panel) whenShown(panel, start);
  else if (root.dataset['trigger'] === 'input') whenInput(start);
  else whenIdle(start);
}

/**
 * The box's `load` for lazy.mjs: a dynamic import of the loader (ui/deferred.mjs), which stays out of the page's first
 * bytes. If the import itself fails (a lost connection, a stale deploy) the box shows its error block, and Retry reloads
 * the page: the browser keeps a failed module import for the page's life, so importing again would fail the same way.
 * @param {HTMLElement} root
 * @param {() => void} [reload]
 * @returns {() => Promise<typeof import('./deferred.mjs')>}
 */
export const loader =
  (root, reload = () => location.reload()) =>
  () =>
    import('./deferred.mjs').catch((/** @type {unknown} */ cause) => {
      root.dataset['state'] = 'error';
      root.removeAttribute('aria-busy');
      /** @type {HTMLElement} */ (root.querySelector('[data-deferred-error]')).hidden = false;
      root.querySelector('[data-deferred-retry]')?.addEventListener('click', reload, { once: true });
      throw cause;
    });
