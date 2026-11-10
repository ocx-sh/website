// The phone TOC element, defined by the same entry script as `starlight-toc` (TableOfContents.astro) so
// Starlight's separate MobileTableOfContents script, one more request on every page, is gone.
import { StarlightTOC } from 'virtual:ocx-theme/starlight/TableOfContents/starlight-toc.js';

class MobileStarlightTOC extends StarlightTOC {
  /**
   * @override
   * @param {HTMLAnchorElement} link
   */
  set current(link) {
    super.current = link;
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
    for (const a of details.querySelectorAll('a')) a.addEventListener('click', close);
    window.addEventListener('click', (e) => {
      if (!details.contains(/** @type {Node} */ (e.target))) close();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !details.open) return;
      const focused = details.contains(document.activeElement);
      close();
      if (focused) details.querySelector('summary')?.focus();
    });
  }
}

customElements.define('mobile-starlight-toc', MobileStarlightTOC);
