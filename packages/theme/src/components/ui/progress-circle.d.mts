/** @typedef {'s' | 'm' | 'l'} ProgressCircleSize */
/**
 * @param {{ value?: number | undefined, size?: ProgressCircleSize }} [options] `value` 0–100 (clamped); absent
 *   or NaN = indeterminate, a quarter arc the stylesheet spins.
 * @returns {string} an `<svg>` string
 */
export function progressCircleSvg({ value, size }?: {
    value?: number | undefined;
    size?: ProgressCircleSize;
}): string;
export type ProgressCircleSize = "s" | "m" | "l";
