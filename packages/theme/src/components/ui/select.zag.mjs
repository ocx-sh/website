// Select on Zag select (C-161). The visually hidden native <select> is the form control and holds
// the options: a consumer appends <option value data-meta> to it at runtime and the list follows.
// SSR renders the closed parts; the popup and its rows are built here on start.
import { collection, connect, machine } from '@zag-js/select';
import { bindSet, fromCode } from './value-set.mjs';
import { emit } from './zag-runtime.mjs';

export { connect, machine };

/** @type {WeakMap<HTMLElement, () => void>} pushes the native select's options into the running machine */
const resync = new WeakMap();

/** @type {WeakMap<Element, string>} what a popup row was last built from */
const rowSig = new WeakMap();

/** @typedef {{ value: string, label: string, meta?: string | undefined, icon?: string | undefined, disabled?: boolean | undefined }} SelectItem */

/** @param {SelectItem[]} items @returns {ReturnType<typeof collection<SelectItem>>} */
export const toCollection = (items) => collection({ items });

/** @param {HTMLSelectElement} select */
const read = (select) =>
  toCollection(
    [...select.options].map((o) => ({
      value: o.value,
      label: o.text,
      meta: o.dataset.meta,
      icon: o.dataset.icon,
      disabled: o.disabled,
    })),
  );

/** @param {SelectItem} item a list row (overlay.css styles it) */
function row({ label, meta, icon }) {
  const li = document.createElement('li');
  li.className = 'ocx-ui-option';
  if (icon) {
    li.dataset.withIcon = '';
    // Trusted markup: Select.astro builds it from the icon registry (option `data-icon`).
    li.append(Object.assign(document.createElement('span'), { className: 'ocx-ui-option__icon', innerHTML: icon }));
  }
  li.append(Object.assign(document.createElement('span'), { className: 'ocx-ui-option__label', textContent: label }));
  if (meta)
    li.append(Object.assign(document.createElement('span'), { className: 'ocx-ui-option__meta', textContent: meta }));
  return li;
}

/** The popup (positioner > listbox), built on start: closed, it is invisible, so SSR skips it. @param {HTMLElement} root */
function popup(root) {
  const positioner = Object.assign(document.createElement('div'), { className: 'ocx-ui-select__positioner' });
  const list = positioner.appendChild(
    Object.assign(document.createElement('ul'), { className: 'ocx-ui-overlay ocx-ui-select__list' }),
  );
  // After the slot box (control part) when there is one: never a flex item among the addons.
  root.querySelector('[data-part="control"],[data-part="trigger"]')?.after(positioner);
  return list;
}

/**
 * @param {import('@zag-js/select').Api} api
 * @param {HTMLElement} root
 * @param {import('./zag.mjs').Spread} spread
 */
export function render(api, root, spread) {
  const part = (/** @type {string} */ name) => /** @type {HTMLElement} */ (root.querySelector(`[data-part="${name}"]`));
  // `ocx:select:set {value}`: moves the value with no change event (the idle half is value-set.mjs).
  bindSet(root, 'select', api, (latest, detail) => {
    const value = String(detail);
    // Options a consumer just swapped reach the collection on the observer's microtask; a set right behind them must not miss.
    resync.get(root)?.();
    const live = latest();
    if (!live.collection.has(value) || live.value[0] === value) return false;
    live.setValue([value]);
    return true;
  });
  spread(root, api.getRootProps());
  spread(part('label'), api.getLabelProps());
  const control = root.querySelector('[data-part="control"]');
  if (control) spread(control, api.getControlProps());
  spread(part('trigger'), api.getTriggerProps());
  const text = part('value-text');
  spread(text, api.getValueTextProps());
  text.textContent = api.valueAsString;
  // The trigger's icon follows the selection (SSR renders it only when an option has one).
  const glyph = /** @type {HTMLElement | null} */ (root.querySelector('.ocx-ui-select__glyph'));
  const chosen = /** @type {SelectItem[]} */ (api.selectedItems)[0];
  if (glyph && chosen && glyph.dataset.value !== chosen.value) {
    glyph.dataset.value = chosen.value;
    glyph.innerHTML = chosen.icon ?? '';
  }
  spread(part('indicator'), api.getIndicatorProps());
  const content = root.querySelector('.ocx-ui-select__list') ?? popup(root);
  spread(/** @type {Element} */ (content.parentElement), api.getPositionerProps());
  spread(content, api.getContentProps());
  // Rows follow the collection: one the native select no longer holds is dropped (a consumer swapping its options).
  const values = new Set(/** @type {SelectItem[]} */ (api.collection.items).map((i) => i.value));
  for (const stale of content.querySelectorAll('[data-value]'))
    if (!values.has(/** @type {HTMLElement} */ (stale).dataset['value'] ?? '')) stale.remove();
  /** @type {SelectItem[]} */ (api.collection.items).forEach((item, i) => {
    let el = content.querySelector(`[data-value="${CSS.escape(item.value)}"]`);
    const sig = JSON.stringify([item.label, item.meta, item.icon]);
    // A reused row whose native option changed (CommandBar swapping choices) is rebuilt in place.
    if (el && rowSig.get(el) !== sig) {
      const fresh = row(item);
      el.replaceChildren(...fresh.childNodes);
      if (item.icon) el.setAttribute('data-with-icon', '');
      else el.removeAttribute('data-with-icon');
    }
    el ??= row(item);
    rowSig.set(el, sig);
    // Rows keep the native options' order, also for options swapped in later.
    if (content.children[i] !== el) content.insertBefore(el, content.children[i] ?? null);
    spread(el, api.getItemProps({ item }));
    spread(/** @type {Element} */ (el.querySelector('.ocx-ui-option__label')), api.getItemTextProps({ item }));
  });
  spread(/** @type {Element} */ (root.querySelector('select')), api.getHiddenSelectProps());
}

/**
 * Machine props from the native select, the source of truth: items, value (a restored form value
 * wins over SSR), disabled, name; options added later reach the running machine through `update`.
 * @type {NonNullable<import('./zag.mjs').ZagModule['readDom']>}
 */
export function readDom(root, update) {
  const select = /** @type {HTMLSelectElement} */ (root.querySelector('select'));
  /** @type {unknown} the `zag` passthrough, whose positioning refines ours */
  const own = JSON.parse(root.dataset.zagProps ?? '{}');
  // With slots the popup hangs under the whole box, not just the trigger inside it.
  const control = /** @type {HTMLElement | null} */ (root.querySelector('[data-part="control"]'));
  // ponytail: never disconnected; after destroy() `update` is a no-op and the observer dies with the node.
  const sync = () => update({ collection: read(select) });
  resync.set(root, sync);
  new MutationObserver(sync).observe(select, { childList: true });
  return {
    collection: read(select),
    defaultValue: select.selectedIndex < 0 ? [] : [select.value],
    disabled: select.disabled,
    required: select.required,
    name: select.name || undefined,
    form: select.getAttribute('form') ?? undefined,
    invalid: root.querySelector('[data-part="trigger"]')?.getAttribute('aria-invalid') === 'true',
    ids: { hiddenSelect: select.id },
    // Fixed: the popup escapes clipping ancestors (StateGrid cells, scroll boxes).
    positioning: {
      strategy: 'fixed',
      ...(control && { getAnchorElement: () => control }),
      .../** @type {{ positioning?: object }} */ (own).positioning,
    },
    onValueChange: (/** @type {{ value: string[] }} */ { value }) => {
      if (!fromCode(root)) emit(root, 'select', 'change', { value: value[0] ?? '' });
    },
  };
}
