// The live header's swap (r10), loaded by shell-sync.mjs only when the site publishes another nav rev:
// fetch the rev's fragment, check it fits the header it is about to replace, and swap its parts in,
// keeping what is the page's own (active section, current link, the consumer's links, the search slot).
// Refuses, leaving the baked header untouched, on anything unexpected or while the nav is in use.
import { mount } from './components/ui/zag.mjs';
import { SHELL_DIR, SHELL_PARTS, SHELL_REV } from './shell.mjs';

/** The nav's lazy machine, as chrome.mjs mounts it: `mount` returns the live handle, so this only builds a new one after `destroy()`. */
const spec = { load: () => import('./components/navigation-menu.zag.mjs') };

/** Elements a nav fragment never holds, and the only hrefs it may link to (this site, https). */
const FOREIGN = 'script,iframe,object,embed,style,link,base,form';
const HREF = /^(?:\/(?!\/)|https:\/\/)/;

/**
 * Whether `el` matches any selector; one a browser (or jsdom) does not know counts as no match.
 * @param {Element | null | undefined} el
 * @param {...string} selectors
 */
const is = (el, ...selectors) =>
  selectors.some((selector) => {
    try {
      return el?.matches(selector) ?? false;
    } catch {
      return false;
    }
  });

/**
 * Whether the fragment's parts fit: every part present and plain, sections as `li` items of a link or a
 * trigger, one mega panel that every trigger names, only this-site and https links.
 * @param {Record<string, DocumentFragment | undefined>} parts
 * @returns {{ sections: DocumentFragment, mega: DocumentFragment, drawer: DocumentFragment } | undefined}
 */
function fit(parts) {
  const { sections, mega, drawer } = parts;
  if (!sections || !mega || !drawer) return undefined;
  const all = [sections, mega, drawer];
  const handlers = (/** @type {DocumentFragment} */ p) =>
    [...p.querySelectorAll('*')].some((e) => e.getAttributeNames().some((n) => n.startsWith('on')));
  if (all.some((p) => p.querySelector(FOREIGN) || handlers(p))) return undefined;
  if (all.flatMap((p) => [...p.querySelectorAll('[href]')]).some((a) => !HREF.test(a.getAttribute('href') ?? '')))
    return undefined;
  const items = [...sections.children];
  const panel = mega.firstElementChild;
  const ok =
    items.length > 0 &&
    items.every((li) => li.localName === 'li' && li.firstElementChild?.hasAttribute('data-ocx-section')) &&
    mega.children.length === 1 &&
    is(panel, 'nav.ocx-mega[popover][id]') &&
    panel?.querySelector('[data-part="root"] [data-part="trigger"][data-value]') !== null &&
    [...sections.querySelectorAll('button')].every((b) => b.getAttribute('popovertarget') === panel?.id) &&
    drawer.children.length > 0 &&
    [...drawer.children].every((li) => li.localName === 'li');
  return ok ? { sections, mega, drawer } : undefined;
}

/**
 * Swaps the live nav into `header` when it fits and the nav is idle.
 * @param {Document} doc
 * @param {HTMLElement} nav the header's `navigation-menu` Zag root, `data-nav-rev` its baked rev
 * @param {unknown} rev the current rev from the pointer, untrusted
 * @returns {Promise<boolean>} whether the header now shows the live nav
 */
export async function swapShell(doc, nav, rev) {
  const header = /** @type {HTMLElement | null} */ (nav.closest('.ocx-header'));
  if (typeof rev !== 'string' || !SHELL_REV.test(rev) || !header) return false;
  const res = await fetch(`${SHELL_DIR}${rev}/nav.html`);
  if (!res.ok) return false;
  const live = new DOMParser().parseFromString(await res.text(), 'text/html');
  const parts = fit(
    Object.fromEntries(
      SHELL_PARTS.map((name) => [
        name,
        /** @type {HTMLTemplateElement | null} */ (live.querySelector(`template[data-shell-part="${name}"]`))?.content,
      ]),
    ),
  );
  const list = nav.querySelector(':scope > nav > ul');
  const panel = nav.querySelector(':scope > [popover]');
  const drawer = doc.getElementById('ocx-header-menu');
  const drawerList = drawer?.querySelector(':scope > ul');
  if (!parts || !list || !panel) return false;

  const extra = '[data-ocx-section="extra"]';
  const own = (/** @type {Element} */ li) => !li.querySelector(`:scope > ${extra}`);
  const oldItems = [...list.children].filter(own);
  // The drawer lists the nav.json items, then the consumer's: as many trailing items as the nav has extras.
  const extras = list.querySelectorAll(`:scope > li > ${extra}`).length;
  const oldDrawer = drawerList ? [...drawerList.children].slice(0, drawerList.children.length - extras) : [];
  if (oldItems.length === 0 || (drawerList && oldDrawer.length === 0)) return false;

  // Idle: no machine mid-load, no pointer or focus in the nav, no panel or drawer open. Nothing awaits below.
  if (
    is(nav, '[data-zag-state="loading"]', ':hover') ||
    [nav, drawer].some((el) => el?.contains(doc.activeElement)) ||
    [panel, drawer].some((el) => is(el, ':popover-open'))
  )
    return false;

  const active = header.dataset['ocxActive'];
  const currentHrefs = new Set(
    oldDrawer.flatMap((li) => [...li.querySelectorAll('[aria-current="page"]')]).map((a) => a.getAttribute('href')),
  );
  const fresh = (/** @type {DocumentFragment} */ part) => [
    .../** @type {DocumentFragment} */ (doc.importNode(part, true)).children,
  ];
  /** @type {(old: Element[], next: Element[]) => () => void} */
  const swap = (old, next) => {
    old[0]?.before(...next);
    for (const n of old) n.remove();
    return () => {
      next[0]?.before(...old);
      for (const n of next) n.remove();
    };
  };
  const height = header.getBoundingClientRect().height;

  mount(nav, spec).destroy();
  const items = fresh(parts.sections);
  const drawerItems = fresh(parts.drawer);
  const undo = [swap(oldItems, items), swap([panel], fresh(parts.mega))];
  if (drawerList) undo.push(swap(oldDrawer, drawerItems));
  for (const el of items.flatMap((li) => [...li.querySelectorAll('[data-ocx-section]')]))
    if (active && el.getAttribute('data-ocx-section') === active) el.setAttribute('aria-current', 'page');
  for (const a of drawerItems.flatMap((li) => [...li.querySelectorAll('a[href]')]))
    if (currentHrefs.has(a.getAttribute('href'))) a.setAttribute('aria-current', 'page');

  // The header's box is the page's: a swap that would move it (a wrapped nav, a taller row) is not made.
  const fitted = header.getBoundingClientRect().height === height;
  if (fitted) nav.dataset['navRev'] = rev;
  else for (const back of undo.reverse()) back();
  mount(nav, spec);
  return fitted;
}
