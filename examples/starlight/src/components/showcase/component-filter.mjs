// C-120: the components overview filter. Words match the card's text (name and description), plus
// these keywords for names people search by another word. Keep it small: add one only when a
// reader would plausibly type it.
const ALIASES = {
  dropdown: ['select', 'combobox', 'menu'],
  modal: ['dialog', 'drawer'],
  popup: ['popover', 'dialog', 'tooltip'],
  notification: ['toast'],
  checkbox: ['choice'],
  spinner: ['loader'],
};

/**
 * Every whitespace-separated word of `query` matches `text` (or one of its aliases).
 * @param {string} text
 * @param {string} query
 */
export function matches(text, query) {
  const haystack = text.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) =>
      [
        word,
        ...Object.entries(ALIASES).flatMap(([key, to]) => (word.length > 2 && key.startsWith(word) ? to : [])),
      ].some((term) => haystack.includes(term)),
    );
}

/**
 * Shows the items that match, hides the rest, hides every list left empty with its heading (the
 * `h2` before it), and returns the status line.
 * @param {readonly HTMLElement[]} items
 * @param {string} query
 */
export function applyFilter(items, query) {
  let shown = 0;
  for (const item of items) {
    const hit = matches(item.textContent ?? '', query);
    item.hidden = !hit;
    if (hit) shown++;
  }
  for (const list of new Set(items.map((i) => i.parentElement))) {
    if (!(list instanceof HTMLElement)) continue;
    list.hidden = !list.querySelector(':scope > li:not([hidden])');
    const heading = list.previousElementSibling;
    if (heading instanceof HTMLHeadingElement) heading.hidden = list.hidden;
  }
  if (!shown) return 'No component matches';
  return `${shown} ${shown === 1 ? 'component' : 'components'}`;
}

/** @param {Document} [doc] */
export function installFilter(doc = document) {
  for (const root of doc.querySelectorAll('[data-component-filter]')) {
    const input = root.querySelector('input');
    const status = root.querySelector('[data-count]');
    const items = [...doc.querySelectorAll('.showcase-index > li')].filter((li) => li instanceof HTMLElement);
    input?.addEventListener('input', () => {
      if (status) status.textContent = applyFilter(items, input.value);
    });
  }
}

/**
 * The thumbnail route of a card's link: `<base>components/<slug>/` → `<base>stories/<slug>/default/?thumb`.
 * @param {string} href
 */
export const thumbRoute = (href) => href.replace(/components\/(.*)$/, 'stories/$1default/?thumb');

/**
 * D-SB9: a `data-story` thumbnail box's iframe, on its card's `default` story, is created only once
 * the box is on screen (no root margin), so a first view loads the few thumbnails it shows and no
 * other browsing context exists. The iframe is decoration: inert, out of the tab order, hidden from assistive tech, and
 * revealed on load so the fallback title never gives way to a blank frame. Observing starts after the page's `load`.
 * @param {Document} [doc]
 */
export function installThumbs(doc = document) {
  const io = new IntersectionObserver((entries) => {
    for (const { isIntersecting, target } of entries) {
      if (!isIntersecting || !(target instanceof HTMLElement)) continue;
      io.unobserve(target);
      const frame = doc.createElement('iframe');
      frame.title = `${target.textContent?.trim()} preview`;
      frame.setAttribute('inert', '');
      frame.setAttribute('tabindex', '-1');
      frame.setAttribute('aria-hidden', 'true');
      frame.addEventListener('load', () => frame.setAttribute('data-ready', ''), { once: true });
      frame.src = thumbRoute(target.closest('a')?.getAttribute('href') ?? '');
      target.append(frame);
    }
  });
  // After `load`: thumbnails requested during the load race the page's own LCP resources (Lighthouse
  // measured the gallery a round trip later, performance 0.99).
  const start = () => {
    for (const box of doc.querySelectorAll('.showcase-index__thumb[data-story]')) io.observe(box);
  };
  if (doc.readyState === 'complete') start();
  else doc.defaultView?.addEventListener('load', start, { once: true });
}
