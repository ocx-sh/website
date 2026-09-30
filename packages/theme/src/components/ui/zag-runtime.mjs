// Zag glue, vanilla half (D-Z17): SSR goes through `ssrApi` + `ssrAttrs`; on the client, `mount`
// (zag.mjs) imports this with the component's `*.zag.mjs` on first interaction (C-113), and
// `run` starts the machine. Lazy modules take `emit` from here, never from zag.mjs.
import { VanillaMachine, normalizeProps, spreadProps, toStyleString } from '@zag-js/vanilla';

/** @typedef {import('./zag.mjs').ZagModule} ZagModule */
/** @typedef {import('./zag.mjs').Spread} Spread */
/** @typedef {import('./zag.mjs').Spawn} Spawn */
/** @typedef {import('./zag.mjs').AnyMachine} AnyMachine */
/** @typedef {import('./zag.mjs').AnyVanilla} AnyVanilla */
/** @typedef {{ readonly api: unknown, stop: () => void }} Session */

/** HTML boolean attributes Astro renders only for a truthy value: an empty string drops them. */
const BOOLEAN_ATTRS = /^(?:autofocus|checked|disabled|inert|multiple|open|readonly|required|selected)$/;

/**
 * Zag part props → attributes an Astro element can spread (C-102).
 * @param {Record<string, unknown>} props
 * @returns {Record<string, string | true>}
 */
export function ssrAttrs(props) {
  /** @type {Record<string, string | true>} */
  const out = {};
  for (const [key, value] of Object.entries(props)) {
    // data-focus* describe live focus; SSR never has any (C-130a).
    if (value == null || typeof value === 'function' || key === 'data-focus' || key === 'data-focus-visible') continue;
    if (typeof value === 'boolean') {
      if (key.startsWith('aria-')) out[key] = String(value);
      else if (value) out[key] = BOOLEAN_ATTRS.test(key) ? true : '';
    } else if (typeof value === 'string' || typeof value === 'number') out[key] = String(value);
    else if (key === 'style') out[key] = toStyleString(value);
  }
  return out;
}

/**
 * `connect()` of an unstarted machine: the api SSR renders from (C-103). Needs no DOM.
 * @template A
 * @param {AnyMachine} machine
 * @param {(service: AnyVanilla['service'], normalize: typeof normalizeProps) => A} connect
 * @param {Record<string, unknown>} props
 * @returns {A}
 */
export function ssrApi(machine, connect, props) {
  return connect(new VanillaMachine(machine, props).service, normalizeProps);
}

/**
 * Starts `mod`'s machine on `root` and paints it; `stop()` undoes every spread and stops the
 * machine and its children. A throw while starting cleans up before it propagates.
 * @param {HTMLElement} root
 * @param {ZagModule} mod
 * @param {Record<string, unknown>} own machine props from `data-zag-props`
 * @returns {Session}
 */
export function run(root, mod, own) {
  const id = root.dataset.zagId;
  /** @type {Map<Element, () => void>} latest spreadProps cleanup per element */
  const spreads = new Map();
  /** @type {Set<() => void>} stop of every live child machine */
  const children = new Set();
  /** @type {unknown} */
  let api;
  /** @type {VanillaMachine<any> | undefined} */
  let machine;
  const update = (/** @type {Record<string, unknown>} */ next) => machine?.updateProps(next);
  const running = new VanillaMachine(mod.machine, { ...own, id, ...mod.readDom?.(root, update) });
  machine = running;

  /** @type {Spread} */
  const spread = (el, attrs) => void spreads.set(el, spreadProps(el, attrs, id));
  /** @type {Spawn} */
  const spawn = (child, props, connect, draw) => {
    const service = new VanillaMachine(child, props);
    /** @type {Map<Element, () => void>} */
    const parts = new Map();
    /** @type {Spread} */
    const put = (el, attrs) => void parts.set(el, spreadProps(el, attrs, id));
    const repaint = () => draw(connect(service.service, normalizeProps), put);
    const stop = () => {
      if (!children.delete(stop)) return;
      for (const cleanup of parts.values()) cleanup();
      parts.clear();
      service.stop();
    };
    children.add(stop);
    repaint();
    service.subscribe(repaint);
    service.start();
    return { update: (next) => service.updateProps(next), stop };
  };
  const paint = () => {
    api = mod.connect(running.service, normalizeProps);
    mod.render(api, root, spread, spawn);
  };
  const stop = () => {
    for (const end of children) end();
    for (const cleanup of spreads.values()) cleanup();
    spreads.clear();
    machine?.stop(); // also drops its subscriptions
    machine = undefined;
    api = undefined;
  };

  try {
    paint();
    running.subscribe(paint);
    running.start();
  } catch (error) {
    stop();
    throw error;
  }
  return {
    get api() {
      return api;
    },
    stop,
  };
}

/**
 * Surfaces a Zag callback as a DOM event `ocx:<scope>:<name>` (C-105).
 * @param {Element} root
 * @param {string} scope
 * @param {string} name
 * @param {unknown} detail JSON-serialisable
 */
export function emit(root, scope, name, detail) {
  root.dispatchEvent(new CustomEvent(`ocx:${scope}:${name}`, { detail, bubbles: true }));
}
