// Combobox on Zag combobox (C-162): filters its options by the typed text — fuzzy (subsequence +
// one-typo tolerance) by default, `contains` or `startsWith` via the `matchMode` prop — marks the
// match(es), shows the empty text when nothing matches.
import { collection, connect, machine } from '@zag-js/combobox';
import { filterItems, highlight, match } from './fuzzy.mjs';
import { emit } from './zag-runtime.mjs';

export { connect, machine };

/** @typedef {{ value: string, label: string }} ComboboxItem */
/** @typedef {'fuzzy' | 'contains' | 'startsWith'} MatchMode */

/**
 * @param {ComboboxItem[]} items @param {string} [query] keeps the options matching it under `mode`
 * @param {MatchMode} [mode]
 * @returns {ReturnType<typeof collection<ComboboxItem>>}
 */
export const toCollection = (items, query = '', mode = 'fuzzy') =>
  collection({ items: query ? filterItems(items, query, mode) : items });

/**
 * `label` split into render segments around its match(es) of `query` under `mode`; one plain
 * segment, unmarked, when there is none.
 * @param {string} label @param {string} [query] @param {MatchMode} [mode]
 * @returns {{ text: string, mark: boolean }[]}
 */
export function segmentsOf(label, query, mode = 'fuzzy') {
  const hit = query ? match(label, query, mode) : null;
  return hit ? highlight(label, hit.ranges) : [{ text: label, mark: false }];
}

/** Typed text filters; text equal to an option's label (the committed value) does not. @param {ComboboxItem[]} items @param {string} text */
export const queryOf = (items, text) => (items.some((i) => i.label === text) ? '' : text);

/** @param {Element} root @returns {ComboboxItem[]} */
const itemsOf = (root) =>
  [...root.querySelectorAll('[data-part="item"]')].map((el) => ({
    value: /** @type {HTMLElement} */ (el).dataset.value ?? '',
    label: el.querySelector('[data-part="item-text"]')?.textContent ?? '',
  }));

/** @param {Element} root @returns {MatchMode} */
const modeOf = (root) => {
  const m = /** @type {HTMLElement} */ (root).dataset.ocxMatchMode;
  return m === 'contains' || m === 'startsWith' ? m : 'fuzzy';
};

/** @type {WeakMap<Element, string>} last query marked into each item text */
const marked = new WeakMap();

/**
 * @param {import('@zag-js/combobox').Api} api
 * @param {HTMLElement} root
 * @param {import('./zag.mjs').Spread} spread
 */
export function render(api, root, spread) {
  const part = (/** @type {string} */ name) => /** @type {HTMLElement} */ (root.querySelector(`[data-part="${name}"]`));
  spread(root, api.getRootProps());
  spread(part('label'), api.getLabelProps());
  spread(part('control'), api.getControlProps());
  spread(part('input'), api.getInputProps());
  spread(part('clear-trigger'), api.getClearTriggerProps());
  spread(part('positioner'), api.getPositionerProps());
  spread(part('content'), api.getContentProps());
  const items = itemsOf(root);
  const mode = modeOf(root);
  const query = queryOf(items, api.inputValue);
  for (const [i, el] of root.querySelectorAll('[data-part="item"]').entries()) {
    const item = /** @type {ComboboxItem} */ (items[i]);
    const text = /** @type {HTMLElement} */ (el.querySelector('[data-part="item-text"]'));
    spread(el, api.getItemProps({ item }));
    spread(text, api.getItemTextProps({ item }));
    /** @type {HTMLElement} */ (el).hidden = !api.collection.has(item.value);
    if (marked.get(text) !== query) {
      text.replaceChildren(
        ...segmentsOf(item.label, query, mode).map((seg) =>
          seg.mark ? Object.assign(document.createElement('mark'), { textContent: seg.text }) : seg.text,
        ),
      );
      marked.set(text, query);
    }
  }
  /** @type {HTMLElement} */ (root.querySelector('.ocx-ui-combobox__empty')).hidden = api.collection.size > 0;
}

/**
 * Machine props from the SSR DOM (input, items): text typed before start stays and filters; typing
 * later refilters the running machine through `update`.
 * @type {NonNullable<import('./zag.mjs').ZagModule['readDom']>}
 */
export function readDom(root, update) {
  const items = itemsOf(root);
  const mode = modeOf(root);
  const input = /** @type {HTMLInputElement} */ (root.querySelector('input'));
  const valueOf = (/** @type {string} */ sel) =>
    /** @type {HTMLElement | null} */ (root.querySelector(`[data-part="item"]${sel}`))?.dataset.value;
  /** @type {unknown} the `zag` passthrough, whose positioning and translations refine ours */
  const own = JSON.parse(root.dataset.zagProps ?? '{}');
  const committed = valueOf('[data-state="checked"]');
  return {
    collection: toCollection(items, queryOf(items, input.value), mode),
    defaultInputValue: input.value,
    defaultValue: committed === undefined ? [] : [committed],
    defaultHighlightedValue: valueOf('[data-highlighted]') ?? null,
    defaultOpen: !root.querySelector('[data-part="content"]')?.hasAttribute('hidden'),
    placeholder: input.placeholder || undefined,
    disabled: input.disabled,
    ids: { input: input.id },
    translations: {
      .../** @type {{ translations?: object }} */ (own).translations,
      clearTriggerLabel: root.querySelector('[data-part="clear-trigger"]')?.getAttribute('aria-label') ?? undefined,
    },
    positioning: { strategy: 'fixed', .../** @type {{ positioning?: object }} */ (own).positioning },
    onInputValueChange: (/** @type {{ inputValue: string, reason?: string }} */ { inputValue, reason }) => {
      update({ collection: toCollection(items, reason === 'input-change' ? queryOf(items, inputValue) : '', mode) });
      emit(root, 'combobox', 'input', { query: inputValue });
    },
    onValueChange: (/** @type {{ value: string[] }} */ { value }) =>
      emit(root, 'combobox', 'change', { value: value[0] ?? '' }),
  };
}
