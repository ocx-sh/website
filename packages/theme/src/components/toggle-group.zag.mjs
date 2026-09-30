// Zag `toggle-group` for <ToggleGroup> (C-153) and selectable <TagGroup> (C-272). Loaded lazily by
// `mount` (D-Z17).
import { emit } from './ui/zag-runtime.mjs';

export { connect, machine } from '@zag-js/toggle-group';

/** @type {WeakMap<HTMLElement, string>} last rendered value per root */
const last = new WeakMap();

/**
 * Spreads the live api onto the root and items; a changed value emits
 * `ocx:<scope>:change {value}` (the pressed values, in order), scope = the root's `data-zag-root`
 * (`toggle-group`, `tag-group`).
 * @param {import('@zag-js/toggle-group').Api} api
 * @param {HTMLElement} root
 * @param {import('./ui/zag.mjs').Spread} spread
 */
export function render(api, root, spread) {
  spread(root, api.getRootProps());
  // Zag item ids are `<root id>:<value>`; the SSR wrote both.
  for (const el of root.querySelectorAll(`[data-part="item"][data-ownedby="${root.id}"]`))
    spread(el, api.getItemProps({ value: el.id.slice(root.id.length + 1), disabled: el.hasAttribute('disabled') }));
  const value = JSON.stringify(api.value);
  const prev = last.get(root);
  last.set(root, value);
  if (prev !== undefined && prev !== value)
    emit(root, root.dataset['zagRoot'] ?? 'toggle-group', 'change', { value: api.value });
}
