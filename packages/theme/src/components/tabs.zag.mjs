// Zag `tabs` for <Tabs> (C-150, C-151). Loaded lazily by `mount` (D-Z17); reusable by any
// markup that renders the tabs parts (root, list, trigger, content) from `ssrApi`.
import { emit } from './ui/zag-runtime.mjs';

export { connect, machine } from '@zag-js/tabs';

/** Storage key prefix, shared with Starlight's own tabs so a stored choice carries over. */
const PREFIX = 'starlight-synced-tabs__';
/** @type {WeakMap<HTMLElement, { api: import('@zag-js/tabs').Api, value: string | null }>} */
const live = new WeakMap();

/** @param {HTMLElement} root @returns {string} */
const own = (root) => `[data-ownedby="${root.querySelector('[data-part="list"]')?.id ?? ''}"]`;

/**
 * Spreads the live api onto the parts; a changed value emits `ocx:tabs:change {value}` and,
 * under a `data-sync-key`, selects the same label in every group with that key (C-151).
 * @param {import('@zag-js/tabs').Api} api
 * @param {HTMLElement} root
 * @param {import('./ui/zag.mjs').Spread} spread
 */
export function render(api, root, spread) {
  const prev = live.get(root);
  const changed = prev !== undefined && prev.value !== api.value;
  // A peer that followed a sync repeats it: every group already shows the label, so its
  // pass selects nothing and scrolls by 0.
  const key = changed ? root.dataset['syncKey'] : undefined;
  const top = key ? root.getBoundingClientRect().top : 0;
  live.set(root, { api, value: api.value });

  spread(root, api.getRootProps());
  const list = root.querySelector('[data-part="list"]');
  if (list) spread(list, api.getListProps());
  const panels = root.querySelectorAll(`[data-part="content"]${own(root)}`);
  let label = '';
  root.querySelectorAll(`[data-part="trigger"]${own(root)}`).forEach((el, i) => {
    const value = el.getAttribute('data-value') ?? '';
    if (value === api.value) label = el.textContent?.trim() ?? '';
    spread(el, api.getTriggerProps({ value }));
    const panel = panels[i];
    if (panel) spread(panel, api.getContentProps({ value }));
  });

  if (!changed) return;
  emit(root, 'tabs', 'change', { value: api.value });
  if (key) sync(root, key, label, top);
}

/**
 * Selects `label` in every other group with `key`, persists it, and scrolls so the group the
 * reader used stays where it was while groups above it change height.
 * @param {HTMLElement} root @param {string} key @param {string} label @param {number} top
 */
function sync(root, key, label, top) {
  for (const peer of root.ownerDocument.querySelectorAll(
    `[data-zag-root="tabs"][data-sync-key="${CSS.escape(key)}"]`,
  )) {
    if (peer === root || !(peer instanceof HTMLElement) || !selectTab(peer, label)) continue;
    const value = peer
      .querySelector(`[data-part="trigger"][aria-selected="true"]${own(peer)}`)
      ?.getAttribute('data-value');
    // A live peer follows in its machine (its render emits); an idle one keeps the DOM
    // selection for readDom and emits here.
    const state = live.get(peer);
    if (state && value) state.api.setValue(value);
    else emit(peer, 'tabs', 'change', { value });
  }
  try {
    localStorage.setItem(PREFIX + key, label);
  } catch {
    // Storage denied: the groups still switch, the choice is just not remembered (C-151).
  }
  const shift = root.getBoundingClientRect().top - top;
  if (shift) window.scrollBy({ top: shift, behavior: 'instant' });
}

/**
 * The tab selected in the DOM before start (restored or synced while idle).
 * @param {HTMLElement} root
 * @returns {Record<string, unknown>}
 */
export function readDom(root) {
  live.delete(root); // a new machine starts here: the previous one's value is history
  const value = root.querySelector('[data-part="list"] [aria-selected="true"]')?.getAttribute('data-value');
  return value ? { defaultValue: value } : {};
}

/**
 * Selects the tab labelled `label` by rewriting the SSR attributes. Self-contained, with no
 * comment in its body: the restore script inlines its source (C-151).
 * @param {HTMLElement} root
 * @param {string | null | undefined} label
 * @returns {boolean} whether the selection changed
 */
export function selectTab(root, label) {
  const owner = `[data-ownedby="${root.querySelector('[data-part="list"]')?.id ?? ''}"]`;
  const tabs = [...root.querySelectorAll(`[data-part="trigger"]${owner}`)];
  const next = tabs.find((t) => t.textContent?.trim() === label);
  if (!next || next.getAttribute('aria-selected') === 'true') return false;
  const panels = root.querySelectorAll(`[data-part="content"]${owner}`);
  tabs.forEach((t, i) => {
    const on = t === next;
    const panel = panels[i];
    t.setAttribute('aria-selected', String(on));
    t.setAttribute('tabindex', on ? '0' : '-1');
    t.toggleAttribute('data-selected', on);
    if (on && panel) t.setAttribute('aria-controls', panel.id);
    else t.removeAttribute('aria-controls');
    panel?.toggleAttribute('hidden', !on);
    panel?.toggleAttribute('data-selected', on);
  });
  return true;
}
