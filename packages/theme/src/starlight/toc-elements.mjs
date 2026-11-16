// Both outline elements, defined by TableOfContents.astro's entry script: `starlight-toc` (desktop) and
// `mobile-starlight-toc` (phone), so Starlight's MobileTableOfContents script, one more request on every page, is gone.
// Starlight's own `starlight-toc` is not loaded: its IntersectionObserver spy only ever asked for a recompute, which the
// inline scroll spy in TableOfContents.astro runs on each scroll and resize anyway. An element here is the setter it calls.

class OutlineElement extends HTMLElement {
  /** @type {HTMLAnchorElement | undefined} */
  marked;

  /**
   * The current row: it alone carries `aria-current="true"` (Starlight's markup, which starlight.css styles).
   * @param {HTMLAnchorElement} link
   */
  set current(link) {
    if (link === this.marked) return;
    this.marked?.removeAttribute('aria-current');
    link.setAttribute('aria-current', 'true');
    this.marked = link;
  }
}

class MobileOutlineElement extends OutlineElement {
  /** @type {HTMLAnchorElement | undefined} */
  link;

  /**
   * The spy's row is the desktop outline's: the phone list is parsed in on the first open, and from then on its own
   * copy of the row carries the mark.
   * @override
   * @param {HTMLAnchorElement} link
   */
  set current(link) {
    this.link = link;
    const own = [...this.querySelectorAll('a')].find((a) => a.hash === link.hash);
    if (own) super.current = own;
    const display = this.querySelector('.display-current');
    if (display) display.textContent = link.textContent;
  }

  constructor() {
    super();
    const details = this.querySelector('details');
    if (!details) return;
    const close = () => {
      details.open = false;
    };
    // The list (MobileTableOfContents.astro) is a <noscript>'s text until the first open. The summary's click reaches
    // this listener before the details opens, so the rows are in by then; a tap before this script ran opened it empty.
    const list = details.querySelector('noscript');
    const fill = () => {
      if (!list?.isConnected) return;
      list.outerHTML = /** @type {string} */ (list.textContent);
      if (this.link) this.current = this.link;
    };
    if (details.open) fill();
    window.addEventListener('click', (e) => {
      const target = /** @type {Element} */ (e.target);
      if (!details.contains(target) || target.closest('a')) close();
      else if (target.closest('summary')) fill();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !details.open) return;
      const focused = details.contains(document.activeElement);
      close();
      if (focused) details.querySelector('summary')?.focus();
    });
  }
}

customElements.define('starlight-toc', OutlineElement);
customElements.define('mobile-starlight-toc', MobileOutlineElement);
