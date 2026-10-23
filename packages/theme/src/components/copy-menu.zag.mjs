// CopyMenu behaviour (D-056, D-083) on the ActionMenu machine (ui/menu.zag.mjs): a menu of copy
// items, from a button or as a context menu over any number of hosts. Loaded lazily by CopyMenu.astro
// through `mount`. In context mode the root's descendants carrying `data-copy` are the hosts: this
// module listens on the root (delegation), so hosts appended later work and no host gains a Tab stop.
import * as menu from './ui/menu.zag.mjs';
import { copyWithToast } from './copy.mjs';
import { hostOf } from './copy-host.mjs';

export { connect, machine } from './ui/menu.zag.mjs';

/** @type {WeakMap<HTMLElement, HTMLElement>} the host a root's open context menu belongs to */
const openers = new WeakMap();

/**
 * Points the items at `host`: it keeps the items it has a text for (their text on the item element,
 * which is what a selection reads) and takes the rest out of sight and out of the arrow keys.
 * @param {HTMLElement} root
 * @param {NonNullable<ReturnType<typeof hostOf>>} found
 */
function arm(root, { host, map }) {
  for (const item of root.querySelectorAll('[data-part="item"]')) {
    const key = item.getAttribute('data-value') ?? '';
    const text = Object.hasOwn(map, key) ? map[key] : undefined;
    item.toggleAttribute('hidden', text === undefined);
    item.toggleAttribute('data-disabled', text === undefined);
    if (text === undefined) item.removeAttribute('data-copy-text');
    else item.setAttribute('data-copy-text', text);
  }
  openers.set(root, host);
}

/**
 * The context-menu handlers for `root`, bound to the latest api, keyed as the vanilla normalizer
 * spells them (lower case). A key-opened menu (ContextMenu, Shift+F10) reports no pointer position:
 * it anchors under the host.
 * @param {import('@zag-js/menu').Api} api
 * @param {HTMLElement} root
 */
function hostHandlers(api, root) {
  // Zag types its props as `any`; the handlers are the ones its context trigger spreads.
  const trigger = () => /** @type {Record<string, (event: unknown) => void>} */ (api.getContextTriggerProps());
  /** @param {PointerEvent} event */
  const touch = (event) => event.pointerType !== 'mouse';
  return {
    /** @param {MouseEvent} event */
    oncontextmenu(event) {
      const found = hostOf(root, event.target);
      if (!found) return;
      arm(root, found);
      const { left, bottom } = found.host.getBoundingClientRect();
      const keyboard = !event.clientX && !event.clientY;
      trigger()['oncontextmenu']?.(
        keyboard ? { clientX: left, clientY: bottom, preventDefault: () => event.preventDefault() } : event,
      );
    },
    /** @param {PointerEvent} event */
    onpointerdown(event) {
      const found = touch(event) && hostOf(root, event.target);
      if (!found) return;
      arm(root, found);
      trigger()['onpointerdown']?.(event);
    },
    ...Object.fromEntries(
      ['onpointerup', 'onpointermove', 'onpointercancel'].map((name) => [
        name,
        /** @param {PointerEvent} event */ (event) => {
          if (touch(event)) trigger()[name]?.(event);
        },
      ]),
    ),
  };
}

/**
 * Spreads every part's live attributes (ZagModule['render']), plus the delegated host handlers.
 * @param {import('@zag-js/menu').Api} api
 * @param {HTMLElement} root
 * @param {import('./ui/zag.mjs').Spread} spread
 */
export function render(api, root, spread) {
  menu.render(api, root, spread);
  if (root.hasAttribute('data-context')) spread(root, hostHandlers(api, root));
}

/** Focus back to the host a context menu left (D-056); a button menu is Zag's own. @param {HTMLElement} root */
function restoreFocus(root) {
  const host = openers.get(root);
  openers.delete(root);
  if (!host) return;
  // After Zag has hidden the content and settled its own focus work: focus then sits on the
  // (hidden) content or nowhere. A close that moved focus on purpose (a click elsewhere, Tab) is
  // left alone.
  setTimeout(() => {
    const active = root.ownerDocument.activeElement;
    const content = root.querySelector('[data-part="content"]');
    if (host.isConnected && (!active || active === root.ownerDocument.body || content?.contains(active)))
      host.focus({ preventScroll: true });
  });
}

/** Callbacks surface as DOM events (C-105); a selection copies the item's own text. @param {HTMLElement} root */
export function readDom(root) {
  const base = menu.readDom(root);
  return {
    onOpenChange(/** @type {{ open: boolean }} */ detail) {
      base.onOpenChange(detail);
      if (!detail.open) restoreFocus(root);
    },
    // A right-click on another host while the menu is open moves it there (D-083). Zag only spares a
    // context trigger of its own from the outside-pointer dismissal; the hosts here are not one, and
    // its deferred close would otherwise land after the reopen.
    onPointerDownOutside(
      /** @type {{ detail: { contextmenu: boolean, originalEvent: Event }, preventDefault: () => void }} */ event,
    ) {
      if (event.detail.contextmenu && hostOf(root, event.detail.originalEvent.target)) event.preventDefault();
    },
    onSelect(/** @type {{ value: string }} */ detail) {
      base.onSelect(detail);
      const item = [...root.querySelectorAll('[data-part="item"]')].find(
        (el) => el.getAttribute('data-value') === detail.value,
      );
      const text = item?.getAttribute('data-copy-text');
      if (item && text != null) void copyWithToast(root, text, item.getAttribute('data-copy-meaning') ?? text);
    },
  };
}
