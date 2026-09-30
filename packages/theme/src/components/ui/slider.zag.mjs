// Slider on Zag slider (C-270): a single thumb or a range (APG slider, multi-thumb). SSR draws
// every part from `ssrApi` (thumbAlignment 'center', so thumb and range are plain percentages);
// on start the machine takes over. The hidden inputs are the form fields; their values are the
// source of truth when the machine starts.
import { connect, machine } from '@zag-js/slider';
import { formatValue, formatValues } from './range.mjs';
import { emit } from './zag-runtime.mjs';

export { connect, machine };

/** @param {HTMLElement} root @returns {Intl.NumberFormatOptions | undefined} the `format` prop, as SSR wrote it */
const formatOf = (root) =>
  root.dataset.ocxFormat ? /** @type {Intl.NumberFormatOptions} */ (JSON.parse(root.dataset.ocxFormat)) : undefined;

/**
 * @param {import('@zag-js/slider').Api} api
 * @param {HTMLElement} root
 * @param {import('./zag.mjs').Spread} spread
 */
export function render(api, root, spread) {
  const part = (/** @type {string} */ name) =>
    /** @type {HTMLElement | null} */ (root.querySelector(`[data-part="${name}"]`));
  const each = (/** @type {string} */ name) => root.querySelectorAll(`[data-part="${name}"]`);
  const must = (/** @type {string} */ name) => /** @type {HTMLElement} */ (part(name));
  spread(root, api.getRootProps());
  spread(must('label'), api.getLabelProps());
  const text = part('value-text');
  if (text) {
    spread(text, api.getValueTextProps());
    const shown = formatValues(api.value, formatOf(root));
    if (text.textContent !== shown) text.textContent = shown;
  }
  spread(must('control'), api.getControlProps());
  spread(must('track'), api.getTrackProps());
  spread(must('range'), api.getRangeProps());
  for (const [index, thumb] of each('thumb').entries()) {
    const props = /** @type {Record<string, unknown> & { onkeydown?: (e: KeyboardEvent) => void }} */ (
      api.getThumbProps({ index })
    );
    // APG: Up/Down step a horizontal slider too; Zag maps only Left/Right there.
    const { onkeydown } = props;
    if (props['aria-orientation'] === 'horizontal')
      props.onkeydown = (/** @type {KeyboardEvent} */ event) => {
        const up = event.key === 'ArrowUp';
        if (event.defaultPrevented || !(up || event.key === 'ArrowDown') || root.hasAttribute('data-disabled')) {
          onkeydown?.(event);
          return;
        }
        if (up) api.increment(index);
        else api.decrement(index);
        event.preventDefault();
        event.stopPropagation();
      };
    spread(thumb, props);
    const input = /** @type {HTMLInputElement} */ (thumb.querySelector('input'));
    spread(input, api.getHiddenInputProps({ index }));
    // Zag never disables the hidden field, so a disabled slider would still submit its value.
    input.disabled = root.hasAttribute('data-disabled');
  }
  const group = part('marker-group');
  if (group) spread(group, api.getMarkerGroupProps());
  for (const marker of each('marker'))
    spread(marker, api.getMarkerProps({ value: Number(/** @type {HTMLElement} */ (marker).dataset.value) }));
}

/** @type {NonNullable<import('./zag.mjs').ZagModule['readDom']>} */
export const readDom = (root) => {
  const value = [...root.querySelectorAll('[data-part="thumb"] input')].map((i) =>
    Number(/** @type {HTMLInputElement} */ (i).value),
  );
  const format = formatOf(root);
  // The event carries the shape of the `value` prop: a number for one thumb, an array for a range.
  const shape = (/** @type {number[]} */ v) => (v.length === 1 ? v[0] : v);
  return {
    defaultValue: value,
    ...(format && { getAriaValueText: (/** @type {{ value: number }} */ d) => formatValue(d.value, format) }),
    onValueChange: (/** @type {{ value: number[] }} */ d) => emit(root, 'slider', 'input', { value: shape(d.value) }),
    onValueChangeEnd: (/** @type {{ value: number[] }} */ d) =>
      emit(root, 'slider', 'change', { value: shape(d.value) }),
  };
};
