// Shared by checkbox.zag.mjs and switch.zag.mjs (Choice, C-160): the two machines take the same
// parts and props. No Zag import here, so neither chunk pulls in the other machine.
import { emit } from './zag-runtime.mjs';

/**
 * @param {import('@zag-js/checkbox').Api | import('@zag-js/switch').Api} api
 * @param {HTMLElement} root
 * @param {import('./zag.mjs').Spread} spread
 */
export function render(api, root, spread) {
  const part = (/** @type {string} */ name) => /** @type {Element} */ (root.querySelector(`[data-part="${name}"]`));
  spread(root, api.getRootProps());
  spread(/** @type {Element} */ (root.querySelector('input')), api.getHiddenInputProps());
  spread(part('control'), api.getControlProps());
  spread(part('label'), api.getLabelProps());
}

/**
 * Machine props from the native input, the source of truth (D-Z7): a click before start already
 * toggled it (replay is off), so its state wins over the SSR one (S-110).
 * @param {'checkbox' | 'switch'} scope
 * @returns {NonNullable<import('./zag.mjs').ZagModule['readDom']>}
 */
export const readDom = (scope) => (root) => {
  const input = /** @type {HTMLInputElement} */ (root.querySelector('input'));
  return {
    defaultChecked: input.checked,
    disabled: input.disabled,
    required: input.required,
    name: input.name || undefined,
    value: input.value,
    form: input.getAttribute('form') ?? undefined,
    ids: { hiddenInput: input.id },
    onCheckedChange: (/** @type {{ checked: unknown }} */ { checked }) => emit(root, scope, 'change', { checked }),
  };
};
