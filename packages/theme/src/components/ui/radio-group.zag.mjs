// RadioGroup on Zag radio-group (C-160, D-Z7). Native radios sharing one `name` stay the form
// control (arrow keys, submit and JS-off are the browser's); the machine mirrors the checked one.
import { connect, machine } from '@zag-js/radio-group';
import { emit } from './zag-runtime.mjs';

export { connect, machine };

/**
 * @param {import('@zag-js/radio-group').Api} api
 * @param {HTMLElement} root
 * @param {import('./zag.mjs').Spread} spread
 */
export function render(api, root, spread) {
  spread(root, api.getRootProps());
  spread(/** @type {Element} */ (root.querySelector('[data-part="label"]')), api.getLabelProps());
  for (const el of root.querySelectorAll('[data-part="item"]')) {
    const input = /** @type {HTMLInputElement} */ (el.querySelector('input'));
    // Zag only ever sets `disabled` where the item is disabled, so the input is a stable source.
    const item = { value: input.value, disabled: input.disabled };
    spread(el, api.getItemProps(item));
    spread(input, api.getItemHiddenInputProps(item));
    spread(/** @type {Element} */ (el.querySelector('[data-part="item-control"]')), api.getItemControlProps(item));
    spread(/** @type {Element} */ (el.querySelector('[data-part="item-text"]')), api.getItemTextProps(item));
  }
}

/**
 * Machine props from the native radios, the source of truth (D-Z7): the one checked before
 * start (no replay) wins over the SSR value (S-110).
 * @type {NonNullable<import('./zag.mjs').ZagModule['readDom']>}
 */
export const readDom = (root) => ({
  name: root.querySelector('input')?.name,
  orientation: root.dataset.orientation,
  defaultValue: /** @type {HTMLInputElement | null} */ (root.querySelector('input:checked'))?.value ?? null,
  onValueChange: (/** @type {{ value: string | null }} */ { value }) => emit(root, 'radio-group', 'change', { value }),
});
