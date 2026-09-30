/** Grace period (ms) that keeps an open tooltip open while the pointer travels from the trigger onto the popup. */
export const GRACE_MS = 100;

let seq = 0;
/**
 * Next popup id. A module counter, never random, so build output is reproducible.
 * @returns {string}
 */
export const nextTooltipId = () => `ocx-tooltip-${++seq}`;

/** Close function of the one open tooltip (only one is open at a time). @type {(() => void) | null} */
let closeCurrent = null;

/**
 * Wire one inline tooltip (DOC-EX-34): focus opens it at once, hover opens it
 * after `data-delay` ms, moving the pointer onto the popup keeps it open,
 * Escape / blur / pointer leave (unless focused) / scroll close it, and only one
 * tooltip is open at a time. A tap or click focuses the trigger.
 * Focus may move from the trigger into the popup (e.g. a link) without closing it.
 * @param {HTMLElement} root a `[data-ocx-tooltip]` span holding the trigger
 *   `<button aria-describedby>` and the `popover="manual"` `[role="tooltip"]` it names
 * @returns {void}
 */
export function initTooltip(root) {
  const trigger = /** @type {HTMLButtonElement} */ (root.querySelector('button'));
  const popup = /** @type {HTMLElement} */ (
    root.ownerDocument.getElementById(trigger.getAttribute('aria-describedby') ?? '')
  );
  const delay = Number(root.dataset['delay'] ?? 400);
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  let hovered = false;

  const isOpen = () => popup.matches(':popover-open');
  /** @param {EventTarget | null} n */
  const inside = (n) => n instanceof Node && root.contains(n);
  /** @param {() => void} fn @param {number} ms */
  const later = (fn, ms) => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };

  const doc = root.ownerDocument;
  const focused = () => inside(doc.activeElement);

  const place = () => {
    // Record the side CSS position-try actually used (Radix `data-side` semantics:
    // arrow and slide key off it) and aim the arrow at the trigger's centre.
    const t = trigger.getBoundingClientRect();
    const p = popup.getBoundingClientRect();
    const side =
      p.bottom <= t.top + 1 ? 'top' : p.top >= t.bottom - 1 ? 'bottom' : p.right <= t.left + 1 ? 'left' : 'right';
    popup.dataset['side'] = side;
    const along = side === 'top' || side === 'bottom' ? t.left + t.width / 2 - p.left : t.top + t.height / 2 - p.top;
    popup.style.setProperty('--_arrow', `${along}px`);
  };
  // Side and arrow are measured once per open, so a scroll closes a hover-opened
  // tooltip (Radix). A focused one stays (WCAG 1.4.13 persistent; Tab itself
  // scrolls the trigger into view) and is re-measured instead.
  const onScroll = () => {
    if (focused()) place();
    else close();
  };
  /** @type {AddEventListenerOptions} */
  const scrollOpts = { capture: true, passive: true };

  const close = () => {
    clearTimeout(timer);
    if (closeCurrent === close) closeCurrent = null;
    doc.removeEventListener('scroll', onScroll, scrollOpts);
    if (isOpen()) popup.hidePopover();
  };
  const open = () => {
    clearTimeout(timer);
    if (isOpen()) return;
    if (closeCurrent) closeCurrent();
    closeCurrent = close;
    popup.showPopover();
    place();
    doc.addEventListener('scroll', onScroll, scrollOpts);
  };

  // Focus from outside opens at once; focus moving between trigger and popup is ignored.
  root.addEventListener('focusin', (e) => {
    if (!inside(e.relatedTarget)) open();
  });
  root.addEventListener('focusout', (e) => {
    if (!inside(e.relatedTarget) && !hovered) close();
  });
  // WebKit/iOS does not focus a <button> on tap, and touch pointer events are
  // ignored below, so a tap would never open it: focus explicitly.
  trigger.addEventListener('click', () => trigger.focus());

  // pointerover/out + relatedTarget = enter/leave of trigger ∪ popup (the popup is
  // a DOM descendant of root even in the top layer). Touch has no hover: taps
  // go through focus instead.
  root.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch' || inside(e.relatedTarget)) return;
    hovered = true;
    if (isOpen()) clearTimeout(timer);
    else if (delay > 0) later(open, delay);
    else open();
  });
  root.addEventListener('pointerout', (e) => {
    if (e.pointerType === 'touch' || inside(e.relatedTarget)) return;
    hovered = false;
    // WCAG 1.4.13 persistent: stays open while focus is in trigger or popup.
    if (!focused()) later(close, GRACE_MS);
  });

  doc.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !isOpen()) return;
    // Refocus before hiding, so focus never drops to <body> with the popup.
    if (popup.contains(doc.activeElement)) trigger.focus();
    close();
  });
}
