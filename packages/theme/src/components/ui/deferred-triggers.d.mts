/**
 * Calls `start` at the first input anywhere, or at once if that already happened.
 * @param {() => void} start
 */
export function whenInput(start: () => void): void;
/**
 * Calls `start` once `panel` (a Tabs panel, `hidden` until picked) is not hidden, at once if it already isn't.
 * @param {HTMLElement} panel
 * @param {() => void} start
 */
export function whenShown(panel: HTMLElement, start: () => void): void;
/**
 * Calls `start` once the page has loaded and the browser is idle, or at the first of ANY_INPUT.
 * @param {() => void} start
 */
export function whenIdle(start: () => void): void;
/**
 * Calls `start` when the box's own trigger fires.
 * @param {HTMLElement} root
 * @param {() => void} start
 */
export function arm(root: HTMLElement, start: () => void): void;
export function panelOf(root: HTMLElement): HTMLElement | null;
export function loader(root: HTMLElement, reload?: () => void): () => Promise<typeof import("./deferred.mjs")>;
