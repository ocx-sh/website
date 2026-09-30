// Zag glue, trigger layer (D-Z17, C-104): the only glue a page loads before input (C-113). Each
// Zag-backed component has one `*.zag.mjs` (machine, connect, render, optional readDom) that its
// wrapper loads lazily through `mount`, together with zag-runtime.mjs, the half that imports
// @zag-js/vanilla (and holds `ssrApi`, `ssrAttrs`, `emit`). Runtime imports only: none from vanilla,
// and none from this file in a lazy module, or the bundler merges vanilla or the machines' shared
// deps into this every-page chunk.
// ponytail: no teardown on navigation, pages unload wholesale (Starlight 0.42 has no view
// transitions, D-Z16); add an `astro:before-swap` listener calling destroy() when a ClientRouter is enabled.
/** @typedef {import('@zag-js/vanilla').VanillaMachine<any>} AnyVanilla */
/** @typedef {ConstructorParameters<typeof import('@zag-js/vanilla').VanillaMachine<any>>[0]} AnyMachine */
/** @typedef {(service: AnyVanilla['service'], normalize: typeof import('@zag-js/vanilla').normalizeProps) => unknown} AnyConnect */
/** @typedef {(el: Element, attrs: Record<string, unknown>) => void} Spread */
/** @typedef {{ update: (props: Record<string, unknown>) => void, stop: () => void }} Child */
/**
 * Starts a child machine a component's `render` owns (one per toast): `paint(api, spread)` runs now
 * and on every change; `stop()` undoes its spreads and stops it; the root's teardown stops the rest.
 * @typedef {(machine: AnyMachine, props: Record<string, unknown>, connect: AnyConnect, paint: (api: any, spread: Spread) => void) => Child} Spawn
 */

/**
 * What a component's `*.zag.mjs` exports.
 * @typedef {object} ZagModule
 * @property {AnyMachine} machine
 * @property {AnyConnect} connect
 * @property {(api: any, root: HTMLElement, spread: Spread, spawn: Spawn) => void} render spreads each part's props via `spread`
 * @property {(root: HTMLElement, update: (props: Record<string, unknown>) => void) => Record<string, unknown>} [readDom]
 *   machine props only the page knows: state changed natively before start, and callbacks. `update`
 *   merges props into the running machine later (a filtered or appended item collection).
 */

/**
 * @typedef {object} MountSpec
 * @property {() => Promise<ZagModule>} load dynamic `import()` of the component's `*.zag.mjs`
 * @property {'interaction' | 'visible' | 'manual'} [trigger] default `interaction`
 * @property {boolean} [replay] re-dispatch one early activation after start; default true
 */

/**
 * @typedef {object} MountHandle
 * @property {() => Promise<void>} start begins loading (the `manual` trigger); returns `ready`
 * @property {() => void} destroy
 * @property {Promise<void>} ready settles when the machine is live, failed, or destroyed
 * @property {unknown} api the latest connected api, undefined until live
 */

/**
 * Machine props a wrapper may pass through (C-106): data only, never the ids Zag derives from the root.
 * @template T
 * @typedef {Omit<{ [K in keyof T as NonNullable<T[K]> extends (...args: any[]) => any ? never : K]: T[K] }, 'id' | 'ids' | 'getRootNode' | 'dir'>} ZagProps
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
 * Lazily starts a component's machine on `root` (C-104). Never throws.
 * @param {HTMLElement} root element carrying `data-zag-root`, `data-zag-id`, `data-zag-props`
 * @param {MountSpec} spec
 * @returns {MountHandle}
 */
export function mount(root, { load, trigger = 'interaction', replay = true }) {
  const existing = handles.get(root);
  if (existing) return existing;

  /** @type {import('./zag-runtime.mjs').Session | undefined} */
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

  /** @param {[typeof import('./zag-runtime.mjs').run, ZagModule]} loaded */
  const live = ([run, mod]) => {
    if (destroyed) return;
    session = run(root, mod, parseProps(root.dataset.zagProps));
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
    // The native popover and Zag must never both open (C-192, C-231).
    for (const el of root.querySelectorAll('[popovertarget]')) {
      fallbacks.push([el, el.getAttribute('popovertarget') ?? '']);
      el.removeAttribute('popovertarget');
    }
    if (replay) listen();
    // Only `run`: a kept namespace would ship the runtime's SSR half (ssrApi, ssrAttrs) to every page.
    Promise.all([import('./zag-runtime.mjs').then((m) => m.run), load()])
      .then(live)
      .catch(fail)
      .finally(settle);
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

/** @param {string | undefined} json `data-zag-props`, written by our SSR @returns {Record<string, unknown>} */
function parseProps(json) {
  /** @type {unknown} */
  const value = JSON.parse(json ?? '{}');
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new TypeError('data-zag-props is not an object');
  return /** @type {Record<string, unknown>} */ (value);
}
