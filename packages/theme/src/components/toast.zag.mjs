// The page toaster (C-181) on Zag toast: one group machine on the Footer's region, one child
// machine per visible toast (`spawn`). The Footer loads this on the first `ocx:toast`; nothing
// of it, its styles included, ships before.
/// <reference path="../virtual.d.ts" />
import * as toast from '@zag-js/toast';
import css from './toast.css?inline';
import ringCss from './ui/progress-circle.css?inline';
import { progressCircleSvg } from './ui/progress-circle.mjs';
// Named glyphs, not the ICONS registry: that object cannot be tree-shaken and would ship every icon
// in this lazy chunk.
import { close, error, info, success, warning } from '../icons/icons.generated.mjs';

// Design c-toast: bottom-right, 2.5 s, 3 visible max (design question 10, more queue) — overridable
// per page via `data-placement`/`data-max` on the toaster root (Footer's `[data-zag-root="toast"]"]`),
// read once here at module load, before the store (and so before any render): no flicker.
const toasterEl = typeof document === 'undefined' ? null : document.querySelector('[data-zag-root="toast"]');
const placement = /** @type {toast.Placement} */ (toasterEl?.getAttribute('data-placement')) || 'bottom-end';
const max = Number(toasterEl?.getAttribute('data-max')) || 3;
const DEFAULT_DURATION = 2500;
const store = toast.createStore({ placement, max, duration: DEFAULT_DURATION, offsets: 'var(--ocx-space-5)' });
const group = toast.group.machine;

/** @type {Record<string, string>} unknown/legacy tones fall back to 'info' */
const TONE_TO_TYPE = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  error: 'error',
  loading: 'loading',
  danger: 'error',
};

/** The group machine bound to this page's store (a store is not JSON, so it never crosses SSR). */
/** @type {toast.GroupMachine} */
export const machine = {
  ...group,
  props: (params) => {
    const props = /** @type {toast.GroupProps} */ ({ ...params.props, store });
    return group.props ? group.props({ ...params, props }) : props;
  },
};

/**
 * Group api plus what the Footer needs after start: `show`/`dismiss` for `ocx:toast` /
 * `ocx:toast:dismiss`, and the service the per-toast machines take as `parent`.
 * @param {toast.GroupService} service
 * @param {Parameters<typeof toast.group.connect>[1]} normalize
 * @returns {toast.GroupApi & {
 *   service: toast.GroupService,
 *   show: (detail: import('./toast.mjs').ToastDetail) => void,
 *   dismiss: (id?: string) => void,
 * }}
 */
export function connect(service, normalize) {
  return {
    ...toast.group.connect(service, normalize),
    service,
    /** @param {import('./toast.mjs').ToastDetail} detail */
    show: ({ id, title, description, tone, duration, persistent, action, progress }) => {
      // Update by id is partial: only keys the caller gave (store.create spreads `...data` over the
      // showing toast, so an `undefined` would erase its tone, description or action). Defaults
      // (success tone, duration) apply to a new toast only.
      const showing = id === undefined ? undefined : store.getVisibleToasts().find((t) => t.id === id);
      /** @type {toast.Options} */
      const data = { title };
      // An explicit `id: undefined` key would overwrite the store's own computed uuid: omit it.
      if (id !== undefined) data.id = id;
      if (description !== undefined) data.description = description;
      // Progress rides in Zag's `meta` (replaced whole on an update, so only set when given: an update
      // without it keeps the last value). Whether it draws is `render`'s call: loading toasts only.
      if (progress !== undefined) data.meta = { progress };
      // No tone at all is the pre-existing `ocx:toast` contract (CopyButton, EC copy): success.
      if (tone !== undefined || !showing)
        data.type = /** @type {toast.Type} */ (TONE_TO_TYPE[tone ?? 'success'] ?? 'info');
      // A loading toast's persistence ends with loading (toast.promise's loading → success/error).
      const settles = showing?.type === 'loading' && data.type !== undefined && data.type !== 'loading';
      // Always explicit: an absent duration would fall to Zag's per-type defaults (2 s / 5 s), not the
      // store's. An action toast never auto-dismisses (WCAG 2.2.1: time to reach the action).
      if (!showing || settles || duration !== undefined || persistent !== undefined || action !== undefined)
        data.duration = persistent || action ? Infinity : (duration ?? DEFAULT_DURATION);
      if (action)
        data.action = {
          label: action.label,
          onClick: () => {
            document.dispatchEvent(new CustomEvent(action.event, { bubbles: true }));
          },
        };
      store.create(data);
    },
    dismiss: (id) => {
      store.dismiss(id);
    },
  };
}

// Status glyphs come from the icon registry, drawn with the same markup as ui/Icon.astro (the
// `.ocx-icon` attributes, tokens in toast.css), so they size, weigh and align like every other icon.
// `loading` is not an icon: it is the shared ProgressCircle ring (ui/progress-circle.mjs), size s =
// `--ocx-icon-md`, indeterminate, or determinate when the toast carries `progress`.
/** @typedef {{ viewBox: string, body: string, stroke?: number }} Glyph */
/** @type {Record<string, Glyph>} */
const ICONS = { success, error, info, warning };
/** @param {Glyph} def */
const svg = ({ viewBox, body, stroke }) =>
  `<svg class="ocx-icon" data-size="md" viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
/**
 * The one status element for a type. Progress counts only on a loading toast.
 * @param {unknown} type
 * @param {number | undefined} progress
 */
const status = (type, progress) =>
  type === 'loading' ? progressCircleSvg({ size: 's', value: progress }) : svg(ICONS[String(type)] ?? info);
/** What the status element shows, for change detection: a loading ring also depends on its progress. */
const statusKey = (/** @type {unknown} */ type, /** @type {number | undefined} */ progress) =>
  type === 'loading' ? `loading:${progress ?? ''}` : String(type);
/** @param {unknown} meta a toast's `meta` @returns {number | undefined} */
const progressOf = (meta) => {
  const v = /** @type {{ progress?: unknown } | undefined} */ (meta)?.progress;
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
};

// `action` here is the toast's own resolved action (Zag's `{ label, onClick }`, as `show` builds
// it), not the public `{ label, event }` shape — `import('./toast.mjs').ToastAction` is that one.
/** @typedef {{ el: HTMLElement, child: import('./ui/zag.mjs').Child, last: Record<string, unknown>, action: toast.ActionOptions | undefined, progress: number | undefined }} Item */
/** @typedef {Map<string, Item>} Items */
// ponytail: the page toaster is never destroyed; after a destroy() its stopped toasts stay here and in
// the DOM until the root renders again. Clear them on teardown if a toaster ever becomes removable.
/** @type {WeakMap<HTMLElement, Items>} rendered toasts per toaster root */
const rendered = new WeakMap();

/**
 * @param {ReturnType<typeof connect>} api
 * @param {HTMLElement} root
 * @param {import('./ui/zag.mjs').Spread} spread
 * @param {import('./ui/zag.mjs').Spawn} spawn
 */
export function render(api, root, spread, spawn) {
  const doc = root.ownerDocument;
  if (!doc.getElementById('ocx-toast-css')) {
    const style = doc.createElement('style');
    style.id = 'ocx-toast-css';
    style.textContent = ringCss + css;
    doc.head.append(style);
  }
  spread(root, api.getGroupProps());
  /** @type {Items} */
  const items = rendered.get(root) ?? new Map();
  rendered.set(root, items);
  const list = api.getToasts();
  list.forEach((data, index) => {
    const id = /** @type {string} */ (data.id); // the store gives every toast one
    /** @type {Record<string, unknown>} */
    const props = { ...data, parent: api.service, index };
    const item = items.get(id);
    if (item) {
      // Action can change on an update (same id, e.g. toast.promise's loading → success/error):
      // kept off the machine api (Zag's `connect` never returns it), so it's held here instead.
      item.action = data.action;
      item.progress = progressOf(data.meta);
      // Only on change: updateProps chains every call, and each mousemove over the region
      // re-publishes every toast (pause), so unconditional updates would grow without bound.
      if (Object.keys(props).some((k) => props[k] !== item.last[k])) {
        item.last = props;
        item.child.update(props);
      }
      return;
    }
    const el = doc.createElement('div');
    let drawn = statusKey(data.type, progressOf(data.meta));
    // Description and the action button always render (hidden when unused, like CopyButton's
    // `.ocx-copy__done`): simpler than rebuilding the toast's markup if an update adds either.
    // `body` is ours, not a Zag part (nothing spreads a `data-scope` onto it): it carries the scope
    // itself, or toast.css's `[data-scope='toast'][data-part='body']` never matches, the body
    // shrinks to its title and the close button follows the title instead of the right edge.
    el.innerHTML =
      `<div data-ghost="before"></div>${status(data.type, progressOf(data.meta))}` +
      `<div data-scope="toast" data-part="body"><span data-part="title"></span><span data-part="description"></span></div>` +
      `<button data-part="action-trigger" hidden></button><button data-part="close-trigger">${svg(close)}</button>` +
      `<div data-ghost="after"></div>`;
    root.append(el);
    const before = /** @type {HTMLElement} */ (el.querySelector('[data-ghost="before"]'));
    const after = /** @type {HTMLElement} */ (el.querySelector('[data-ghost="after"]'));
    const title = /** @type {HTMLElement} */ (el.querySelector('[data-part="title"]'));
    const description = /** @type {HTMLElement} */ (el.querySelector('[data-part="description"]'));
    const actionTrigger = /** @type {HTMLButtonElement} */ (el.querySelector('[data-part="action-trigger"]'));
    const closeTrigger = /** @type {HTMLElement} */ (el.querySelector('[data-part="close-trigger"]'));
    /** @type {Item} */
    const item2 = {
      el,
      child: /** @type {any} */ (null),
      last: props,
      action: data.action,
      progress: progressOf(data.meta),
    };
    // A toast dismissed before its first render (toast.dismiss right after toast, e.g. while this
    // chunk loads) arrives with `message: 'DISMISS'` set, and the machine acts only on a change of
    // it: spawn without, then pass it as an update.
    const { message, ...initial } = props;
    const child = spawn(toast.machine, initial, toast.connect, (/** @type {toast.Api} */ t, put) => {
      put(el, t.getRootProps());
      put(before, t.getGhostBeforeProps());
      put(after, t.getGhostAfterProps());
      put(title, t.getTitleProps());
      put(description, t.getDescriptionProps());
      put(actionTrigger, t.getActionTriggerProps());
      put(closeTrigger, t.getCloseTriggerProps());
      // An update can change the type (toast.promise's loading → success/error) or a loading toast's
      // progress: redraw the status element. Only on change, like the text below.
      const key = statusKey(t.type, item2.progress);
      if (key !== drawn) {
        drawn = key;
        const icon = /** @type {Element} */ (el.querySelector(':scope > svg'));
        icon.outerHTML = status(t.type, item2.progress);
      }
      // Only on change: toast.machine watches its subtree to measure height, so a rewrite of the
      // same text would re-measure, re-render the group and loop.
      const text = String(t.title ?? '');
      if (title.textContent !== text) title.textContent = text;
      const desc = String(t.description ?? '');
      if (description.textContent !== desc) description.textContent = desc;
      description.hidden = !desc;
      const label = item2.action?.label ?? '';
      if (actionTrigger.textContent !== label) actionTrigger.textContent = label;
      actionTrigger.hidden = !label;
    });
    item2.child = child;
    items.set(id, item2);
    if (message) child.update(props);
  });
  for (const [id, { el, child }] of items) {
    if (list.some((t) => t.id === id)) continue;
    child.stop();
    el.remove();
    items.delete(id);
  }
}
