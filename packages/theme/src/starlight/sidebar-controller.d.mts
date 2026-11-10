/**
 * Starts the controller on `sidebar`: every group goes live, every group restored open fills its deferred links at
 * once, a touch of a group prefetches its links (not after a failure), a click on a group's button toggles it and
 * fires `ocx:collapsible:change {open}` on the group (the persist script listens).
 * @param {HTMLElement} sidebar `#starlight__sidebar`
 * @param {Element[]} [early] trigger buttons clicked before the controller was ready: each toggles now
 * @param {EventTarget | null} [first] target of the touch that loaded the controller: its group prefetches now
 */
export function start(sidebar: HTMLElement, early?: Element[], first?: EventTarget | null): void;
