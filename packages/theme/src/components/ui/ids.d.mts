/**
 * Next id for `prefix`. A module counter, never random, so build output is
 * reproducible (same rule as `nextTooltipId`).
 * @param {string} prefix e.g. `input`, `select`, `menu`
 * @returns {string} `ocx-ui-<prefix>-<n>`
 */
export function nextUiId(prefix: string): string;
