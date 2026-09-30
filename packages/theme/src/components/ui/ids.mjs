// Shared by every ui/ primitive that needs an id (label↔control, control↔message, trigger↔popup).

/** @type {Map<string, number>} */
const seq = new Map();

/**
 * Next id for `prefix`. A module counter, never random, so build output is
 * reproducible (same rule as `nextTooltipId`).
 * @param {string} prefix e.g. `input`, `select`, `menu`
 * @returns {string} `ocx-ui-<prefix>-<n>`
 */
export function nextUiId(prefix) {
  const n = (seq.get(prefix) ?? 0) + 1;
  seq.set(prefix, n);
  return `ocx-ui-${prefix}-${n}`;
}
