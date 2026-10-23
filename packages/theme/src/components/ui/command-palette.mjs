// CommandPalette, the eager half (D-094..D-107): the key and click listeners and nothing else. Mod+K
// (a second press closes), "/" (unless the page claims it) and the header trigger open the dialog;
// everything else (the open/close bookkeeping in command-palette-live.mjs, the dialog machine
// dialog.zag.mjs, the search code command-palette-session.mjs) loads on that first open, never before
// input. The handler is eager and cheap, so the chord never waits on a chunk: it calls preventDefault
// at once, the open is queued behind the load, and the key goes back to the browser only after a failed
// load. The markup is CommandPalette.astro's.

/**
 * One result row, a real link.
 * @typedef {object} PaletteItem
 * @property {string} href http(s) or relative; any other scheme is dropped
 * @property {string} label
 * @property {string} [description] muted second line
 */

/**
 * One titled group of rows ("Packages", "Docs"); an empty group is not drawn.
 * @typedef {object} PaletteGroup
 * @property {string} label
 * @property {readonly PaletteItem[]} items
 */

/**
 * What the page's lazily loaded module provides. `search` runs per query (the signal aborts when a
 * newer query or a close supersedes it); `warm` runs on every open, to fetch data ahead of the first query.
 * @typedef {object} PaletteSource
 * @property {(query: string, signal: AbortSignal) => readonly PaletteGroup[] | Promise<readonly PaletteGroup[]>} search
 * @property {() => unknown} [warm]
 */

/**
 * @typedef {object} PaletteOptions
 * @property {() => Promise<PaletteSource>} source dynamic `import()` of the module holding the search; loaded on first open, retried after a failure
 * @property {boolean | (() => boolean)} [slash] open on "/" (default true); a function is asked per keypress, so a page that claims "/" for itself answers false
 */

/** @param {unknown} el */
const isEditable = (el) =>
  el instanceof HTMLElement && (/^(?:input|textarea|select)$/i.test(el.tagName) || el.isContentEditable);

/**
 * Wires the palette in `root` (a `CommandPalette`). Returns `destroy`.
 * @param {HTMLElement} root
 * @param {PaletteOptions} options
 */
export function mountCommandPalette(root, options) {
  const trigger = root.querySelector('[data-cmdpalette-trigger]');
  if (!trigger) throw new Error('command palette: no [data-cmdpalette-trigger] in the root');
  // The name only, as Search does: the painted hint's ⌘ is CSS, from `html[data-platform]`.
  if (document.documentElement.dataset['platform'] === 'mac') trigger.setAttribute('aria-keyshortcuts', 'Meta+K');
  let failed = false;
  /** @type {Promise<import('./command-palette-live.mjs').Live> | undefined} */
  let live;
  /**
   * Queues the open (or the toggle, `open` omitted) behind the lazy half; `opener` is what gets focus back on close.
   * @param {boolean | undefined} open
   * @param {Element | null} opener
   */
  const setOpen = (open, opener) => {
    live ??= import('./command-palette-live.mjs').then((mod) => mod.attach(root, options));
    live.then(
      async (palette) => {
        if (!failed && !(await palette.setOpen(open, opener))) failed = true;
      },
      (error) => {
        failed = true;
        console.error('[ocx] CommandPalette failed to start', root, error);
      },
    );
  };

  const wantsSlash = () => (typeof options.slash === 'function' ? options.slash() : (options.slash ?? true));
  /** @param {KeyboardEvent} event */
  const onKeydown = (event) => {
    if (failed || event.isComposing) return;
    const active = document.activeElement;
    // Typing elsewhere is left alone; the palette's own input still takes the chord (a second press closes).
    if (isEditable(active) && !root.contains(active)) return;
    // An autofill keydown can arrive without a key.
    if ((event.metaKey || event.ctrlKey) && String(event.key).toLowerCase() === 'k') {
      event.preventDefault();
      setOpen(undefined, active);
    } else if (
      event.key === '/' &&
      !(event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) &&
      !isEditable(active) &&
      trigger.getAttribute('aria-expanded') !== 'true' &&
      wantsSlash()
    ) {
      event.preventDefault();
      setOpen(true, active);
    }
  };
  // Safari does not focus a button on click: the trigger is the opener.
  const onTrigger = () => setOpen(true, trigger);

  document.addEventListener('keydown', onKeydown);
  trigger.addEventListener('click', onTrigger);
  return {
    destroy() {
      document.removeEventListener('keydown', onKeydown);
      trigger.removeEventListener('click', onTrigger);
      void live?.then(
        (palette) => palette.destroy(),
        () => {},
      );
    },
  };
}
