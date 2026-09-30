/**
 * Close a popover when focus leaves it (WCAG 2.4.11): Esc and outside click
 * are the Popover API's own, focus moving elsewhere is not. Focus moving to the
 * panel's own trigger is left alone (the trigger's click toggles it), and so is
 * a null target (Safari does not focus clicked buttons; light dismiss covers it).
 * @param {HTMLElement} panel an element with the `popover` attribute
 * @returns {void}
 */
export function closeOnFocusOut(panel) {
  panel.addEventListener('focusout', (e) => {
    const to = /** @type {FocusEvent} */ (e).relatedTarget;
    if (!(to instanceof Element) || panel.contains(to) || to.closest(`[popovertarget="${panel.id}"]`)) return;
    panel.hidePopover();
  });
}
