/** @param {Event} event */
export function onToggleGroupSet(event: Event): void;
/** A value no option carries changes nothing, as with a native select. @param {Event} event */
export function onSelectSet(event: Event): void;
/**
 * Live half of a set event, zag-free: keeps the latest `api` per root and, once per root, listens for
 * `ocx:<scope>:set`. `apply(latest, value)` (`latest()` is the api, fresh after any machine update) moves the machine and returns whether it did; the next change
 * report is then swallowed (`fromCode`), exactly once.
 * @template A
 * @param {HTMLElement} root
 * @param {string} scope
 * @param {A} api
 * @param {(latest: () => A, value: unknown) => boolean} apply
 */
export function bindSet<A>(root: HTMLElement, scope: string, api: A, apply: (latest: () => A, value: unknown) => boolean): void;
export function fromCode(root: HTMLElement): boolean;
