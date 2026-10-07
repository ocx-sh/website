// Lazy interaction trigger, the generic half of zag.mjs (C-104, C-113): `mount(root, {load, trigger,
// replay})` waits for the first pointerenter/focusin/touchstart (or `visible`, or a manual `start()`),
// loads the module, calls its `start(root, firstEvent?)` and replays one early click or activation key.
// It imports nothing, so `@ocx-sh/theme/lazy` carries no Zag. The `data-zag-*` attribute names are kept
// as the state contract: `data-zag-state` is idle, loading, live or error.
// ponytail: no teardown on navigation, pages unload wholesale (Starlight 0.42 has no view
// transitions, D-Z16); add an `astro:before-swap` listener calling destroy() when a ClientRouter is enabled.

/**
 * What `load` resolves to. `start` returns a session (kept as `api`, stopped on destroy) or nothing.
 * @typedef {object} LazyModule
 * @property {(root: HTMLElement, firstEvent?: MouseEvent | KeyboardEvent) => ({ readonly api: unknown, stop: () => void }) | void} start
 */

/**
 * @typedef {object} MountSpec
 * @property {() => Promise<LazyModule>} load dynamic `import()` of the module that starts the widget
 * @property {'interaction' | 'visible' | 'manual'} [trigger] default `interaction`
 * @property {boolean} [replay] re-dispatch one early activation after start; default true
 */

/**
 * @typedef {object} MountHandle
 * @property {() => Promise<void>} start begins loading (the `manual` trigger); returns `ready`
 * @property {() => void} destroy
 * @property {Promise<void>} ready settles when the module is live, failed, or destroyed
 * @property {unknown} api the latest session api, undefined until live
 */

const INTERACTION = ['pointerenter', 'focusin', 'touchstart'];
const ACTIVATION_KEYS = new Set([
  'Enter',
  ' ',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'Escape',
]);
// Roving-focus parts (tree items) carry only a tabindex.
const INTERACTIVE = 'a[href],button,input,select,textarea,label,summary,[contenteditable],[tabindex]';
/** @type {WeakMap<HTMLElement, MountHandle>} */
const handles = new WeakMap();

/**
 * Lazily starts a widget on `root` (C-104). Never throws.
 * @param {HTMLElement} root element carrying `data-zag-root`
 * @param {MountSpec} spec
 * @returns {MountHandle}
 */
export function mount(root, { load, trigger = 'interaction', replay = true }) {
  const existing = handles.get(root);
  if (existing) return existing;

  /** @type {{ readonly api: unknown, stop: () => void } | void} */
  let session;
  let started = false;
  let destroyed = false;
  /** @type {{ event: MouseEvent | KeyboardEvent, target: EventTarget | null } | undefined} */
  let early;
  /** @type {IntersectionObserver | undefined} */
  let observer;
  /** @type {[Element, string][]} */
  const fallbacks = [];
  /** @type {() => void} */
  let settle = () => {};
  /** @type {Promise<void>} */
  const ready = new Promise((resolve) => (settle = () => resolve()));

  // One early activation: the click if one came, else the first activating key. An event inside a
  // nested root belongs to that root only (else both replay it and a toggle cancels itself).
  const inRoot = (/** @type {Event} */ event) => {
    const target = /** @type {Partial<Element> | null} */ (event.target);
    return !target?.closest || target.closest('[data-zag-root]') === root;
  };
  // A click also must not land on plain content: a link, a form's submit or reset button (a part
  // too; a typeless <button> in a form submits), a copy button, a native checkbox or a summary
  // already ran its native action, which a replayed click would run twice. A control of the root is
  // a part, or a button outside every part (List's Load more, the header trigger). Keys need no
  // such check: a synthetic key has no native action.
  const ownClick = (/** @type {Event} */ event) => {
    const el = /** @type {HTMLButtonElement | null} */ (
      /** @type {Partial<Element> | null} */ (event.target)?.closest?.(INTERACTIVE)
    );
    const button = el?.matches('button');
    if (!el || el.closest('[data-zag-root]') !== root || (button && el.form && el.type !== 'button')) return false;
    if (el.hasAttribute('data-part')) return true;
    if (!button && !el.matches('[tabindex]')) return false;
    return el.parentElement?.closest('[data-part],[data-zag-root]') === root;
  };
  const onClick = (/** @type {MouseEvent} */ event) => {
    if (ownClick(event) && early?.event.type !== 'click') early = { event, target: event.target };
  };
  const onKey = (/** @type {KeyboardEvent} */ event) => {
    if (inRoot(event) && !early && ACTIVATION_KEYS.has(event.key)) early = { event, target: event.target };
  };
  const listen = () => {
    root.addEventListener('click', onClick, true);
    root.addEventListener('keydown', onKey, true);
  };
  const unlisten = () => {
    root.removeEventListener('click', onClick, true);
    root.removeEventListener('keydown', onKey, true);
  };
  const disarm = () => {
    for (const type of INTERACTION) root.removeEventListener(type, arm);
    observer?.disconnect();
  };
  const restore = () => {
    for (const [el, value] of fallbacks.splice(0)) el.setAttribute('popovertarget', value);
  };
  const teardown = () => {
    session?.stop();
    session = undefined;
  };

  /** @param {LazyModule} mod */
  const live = (mod) => {
    if (destroyed) return;
    session = mod.start(root, early?.event);
    root.dataset.zagState = 'live';
    unlisten();
    // Focus that started the load (a Tab onto a part) reached no Zag handler: hand it over, so
    // focus-driven state holds before the replayed key (tabs arrows, toggle-group roving focus,
    // a select that acts on keys only when focused). Only this root's own parts: a nested
    // widget or a plain link saw its focus already.
    const active = root.ownerDocument.activeElement;
    if (active?.closest('[data-zag-root]') === root) active.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    const { event, target } = early ?? {};
    early = undefined;
    // Untrusted by construction (isTrusted: false); widgets act on it like the original.
    if (event && target)
      target.dispatchEvent(
        event instanceof KeyboardEvent ? new KeyboardEvent(event.type, event) : new MouseEvent(event.type, event),
      );
  };

  /** @param {unknown} error */
  const fail = (error) => {
    unlisten();
    teardown();
    restore();
    if (destroyed) return;
    root.dataset.zagState = 'error';
    console.error('[ocx] Zag failed to start', root, error);
  };

  const arm = () => void start();

  function start() {
    if (started || destroyed) return ready;
    started = true;
    disarm();
    root.dataset.zagState = 'loading';
    // The native popover and the widget must never both open (C-192, C-231).
    for (const el of root.querySelectorAll('[popovertarget]')) {
      fallbacks.push([el, el.getAttribute('popovertarget') ?? '']);
      el.removeAttribute('popovertarget');
    }
    if (replay) listen();
    load().then(live).catch(fail).finally(settle);
    return ready;
  }

  if (trigger === 'interaction') for (const type of INTERACTION) root.addEventListener(type, arm, { passive: true });
  else if (trigger === 'visible') {
    observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && arm());
    observer.observe(root);
  }

  /** @type {MountHandle} */
  const handle = {
    start,
    ready,
    get api() {
      return session?.api;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      disarm();
      unlisten();
      teardown();
      restore();
      if (started) root.dataset.zagState = 'idle';
      handles.delete(root);
      settle();
    },
  };
  handles.set(root, handle);
  return handle;
}
