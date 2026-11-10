// The sidebar's nested groups, one delegated controller instead of a Zag machine per group (chrome.mjs loads it on the
// first touch of the sidebar). A group is the markup Sidebar.astro renders: <li data-zag-root="collapsible"> holding its
// <button data-part="trigger"> and its list `[data-part="content"]`. Open is the list's `hidden` and the button's
// `aria-expanded`; the open and close transition is starlight.css, keyed on `data-zag-state='live'` and `[hidden]`.
// Imports no Zag, and nothing from components/ui/zag.mjs (C-113).
import { fillDeferred } from '../components/ui/deferred-group.mjs';

const GROUP = '[data-zag-root="collapsible"]';

/**
 * Starts the controller on `sidebar`: every group goes live, every group restored open fills its deferred links at
 * once, a touch of a group prefetches its links (not after a failure), a click on a group's button toggles it and
 * fires `ocx:collapsible:change {open}` on the group (the persist script listens).
 * @param {HTMLElement} sidebar `#starlight__sidebar`
 * @param {Element[]} [early] trigger buttons clicked before the controller was ready: each toggles now
 * @param {EventTarget | null} [first] target of the touch that loaded the controller: its group prefetches now
 */
export function start(sidebar, early = [], first = null) {
  /** @type {WeakMap<Element, () => void>} */
  const fills = new WeakMap();
  /** @param {Element} group */
  const fill = (group) => {
    let run = fills.get(group);
    if (!run) fills.set(group, (run = fillDeferred(/** @type {HTMLElement} */ (group))));
    run();
  };
  /** @param {{ target: EventTarget | null }} event */
  const touch = (event) => {
    const group = /** @type {Element | null} */ (event.target)?.closest?.(GROUP);
    // A failed group refetches only on an explicit open, not on every pointer crossing.
    if (group && !group.querySelector(':scope > [data-failed]')) fill(group);
  };
  /** @param {Element | null | undefined} button */
  const toggle = (button) => {
    const group = button?.parentElement;
    const list = button?.nextElementSibling;
    if (!button || !group?.matches(GROUP) || !(list instanceof HTMLElement)) return;
    const open = list.hidden;
    list.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) fill(group); // a failed load tries again on the next open
    group.dispatchEvent(new CustomEvent('ocx:collapsible:change', { detail: { open }, bubbles: true }));
  };
  for (const type of ['pointerover', 'focusin', 'touchstart']) sidebar.addEventListener(type, touch, { passive: true });
  sidebar.addEventListener('click', (e) =>
    toggle(/** @type {Element | null} */ (e.target)?.closest?.('[data-part="trigger"]')),
  );
  for (const group of sidebar.querySelectorAll(GROUP))
    if (group instanceof HTMLElement) {
      group.dataset['zagState'] = 'live';
      if (group.querySelector(':scope > [data-defer]:not([hidden])')) fill(group); // restored open
    }
  // The pointer already rests on that group: no second pointerover will come.
  touch({ target: first });
  for (const button of early) toggle(button);
}
