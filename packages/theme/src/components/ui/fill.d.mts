/**
 * Call from a machine's `onOpenChange`: fetches on an open of a root that has `data-fill-src`.
 * @param {HTMLElement} root
 * @param {'popover' | 'hint'} kind
 * @param {boolean} open
 * @returns {void}
 */
export function fillOnOpen(root: HTMLElement, kind: "popover" | "hint", open: boolean): void;
