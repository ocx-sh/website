/// <reference path="../virtual.d.ts" />
// (The reference types the virtual module, Pagefind UI and import.meta.env for the dts build too.)
// Search dialog (C-210): Zag `dialog` behind Starlight's search hooks, loaded by `Search.astro`
// through `mount` (manual trigger). Pagefind UI is imported on the first open, never at idle,
// with Starlight 0.42.4's options (its `pagefind` config incl. `mergeIndex`) passed through.
import { connect, machine } from '@zag-js/dialog';
import { pagefindUserConfig } from 'virtual:starlight/pagefind-config';
import { emit } from '../components/ui/zag-runtime.mjs';

export { connect, machine };

/**
 * @typedef {object} PagefindContext
 * @property {string} base the site base (`import.meta.env.BASE_URL`)
 * @property {Record<string, string>} translations Starlight's Pagefind translations
 * @property {boolean} stripTrailingSlash Starlight's `trailingSlash: 'never'` handling
 */

/** @typedef {{ url: string, sub_results: { url: string }[] }} PagefindResult */

/**
 * The PagefindUI options Starlight 0.42.4's `Search.astro` builds, unchanged.
 * @param {Record<string, unknown>} config Starlight's `pagefind` config (`virtual:starlight/pagefind-config`)
 * @param {PagefindContext} context
 * @returns {Record<string, unknown>}
 */
export function pagefindOptions(config, { base, translations, stripTrailingSlash }) {
  /** @type {(path: string) => string} */
  const formatURL = stripTrailingSlash ? (path) => path.replace(/(.)\/(#.*)?$/, '$1$2') : (path) => path;
  return {
    ...config,
    element: '#starlight__search',
    baseUrl: base,
    bundlePath: `${base.replace(/\/$/, '')}/pagefind/`,
    showImages: false,
    translations,
    showSubResults: true,
    /** @param {PagefindResult} result */
    processResult: (result) => {
      result.url = formatURL(result.url);
      result.sub_results = result.sub_results.map((sub) => ({ ...sub, url: formatURL(sub.url) }));
    },
  };
}

/** @param {HTMLElement} root @param {string} part */
const partOf = (root, part) => root.querySelector(`[data-part="${part}"]`);

/**
 * Spreads the live dialog parts onto the SSR markup.
 * @param {import('@zag-js/dialog').Api} api
 * @param {HTMLElement} root
 * @param {(el: Element, attrs: Record<string, unknown>) => void} spread
 */
export function render(api, root, spread) {
  // The parts live in a manual popover so the open dialog is in the top layer (see Search.astro).
  /** @type {HTMLElement | null} */ (root.querySelector('.ocx-search__layer'))?.togglePopover?.(api.open);
  for (const [part, attrs] of /** @type {const} */ ([
    ['trigger', api.getTriggerProps()],
    ['backdrop', api.getBackdropProps()],
    [
      'content',
      {
        ...api.getContentProps(),
        // Zag re-checks for a description part only on open; there is none, so never point at one.
        'aria-describedby': undefined,
        // As Starlight: following a result (a same-page heading too) closes the dialog.
        /** @param {MouseEvent} event */
        onClick: (event) => {
          if (event.target instanceof Element && event.target.closest('a[href]')) api.setOpen(false);
        },
      },
    ],
    ['close-trigger', api.getCloseTriggerProps()],
  ])) {
    const el = partOf(root, part);
    if (el) spread(el, attrs);
  }
}

/** Search containers whose Pagefind UI is built (or being built). */
const started = new WeakSet();

/**
 * Imports Pagefind UI and builds it into `#starlight__search`, once per container. In dev the
 * container is absent (the dialog shows Starlight's note), so nothing loads and nothing logs.
 * @param {HTMLElement} root
 */
async function loadPagefind(root) {
  const container = root.querySelector('#starlight__search');
  if (!container || started.has(container)) return;
  started.add(container);
  try {
    const { PagefindUI } = await import('@pagefind/default-ui');
    new PagefindUI(
      pagefindOptions(pagefindUserConfig, {
        base: import.meta.env.BASE_URL,
        translations: parseTranslations(root.dataset['translations']),
        stripTrailingSlash: root.dataset['stripTrailingSlash'] !== undefined,
      }),
    );
    /** @type {HTMLElement | null} */
    const input = container.querySelector('.pagefind-ui__search-input');
    // Pagefind names its input by `title` only (axe label-title-only); the placeholder is Starlight's label.
    input?.setAttribute('aria-label', input.getAttribute('placeholder') ?? '');
    // Opened before the input existed: Zag focused the dialog itself; the input takes over.
    if (partOf(root, 'content')?.hasAttribute('hidden') === false) input?.focus();
  } catch (error) {
    started.delete(container); // the next open retries
    console.error('[ocx] Pagefind UI failed to load', error);
  }
}

/** @param {string | undefined} json `data-translations`, written by our SSR @returns {Record<string, string>} */
function parseTranslations(json) {
  /** @type {unknown} */
  const value = JSON.parse(json ?? '{}');
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? /** @type {Record<string, string>} */ (value)
    : {};
}

/**
 * Machine props only the DOM knows: the initial focus target and the open-change callback
 * (body hook, first-open Pagefind load, `ocx:search:change`).
 * @param {HTMLElement} root
 * @returns {Partial<import('@zag-js/dialog').Props>}
 */
export function readDom(root) {
  /** @type {Element | null} focused before the last open: Ctrl/⌘K may come from anywhere */
  let opener = null;
  return {
    initialFocusEl: () => root.querySelector('.pagefind-ui__search-input'),
    // As Starlight's native dialog: focus goes back where it was, else Zag falls back to the trigger.
    finalFocusEl: () =>
      opener instanceof HTMLElement && opener !== document.body && opener.isConnected ? opener : null,
    onOpenChange: ({ open }) => {
      if (open) opener = document.activeElement;
      document.body.toggleAttribute('data-search-modal-open', open);
      if (open) void loadPagefind(root);
      emit(root, 'search', 'change', { open });
    },
  };
}
