// CommandPalette, the lazy half: loaded by command-palette.mjs on the first open. Search, result
// rows, the combobox keys and the open/close reset. Rows are built with DOM APIs and textContent
// only (no HTML sink); the page's `source` module is imported when the dialog first opens.

/** @typedef {import('./command-palette.mjs').PaletteSource} PaletteSource */
/** @typedef {import('./command-palette.mjs').PaletteGroup} PaletteGroup */

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {string} className
 * @param {string} [text]
 */
function el(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** @param {string} href http(s) or relative: a `javascript:` or `data:` href from a source is never drawn */
function safeHref(href) {
  try {
    return /^https?:$/.test(new URL(href, document.baseURI).protocol);
  } catch {
    return false;
  }
}

/**
 * @param {HTMLElement} root the `CommandPalette`
 * @param {() => Promise<PaletteSource>} importSource
 * @param {(open: boolean) => void} setOpen
 * @returns {{ stop: () => void }}
 */
export function startSession(root, importSource, setOpen) {
  /** @param {string} selector */
  const part = (selector) => {
    const found = root.querySelector(selector);
    if (!found) throw new Error(`command palette: no ${selector} in the root`);
    return /** @type {HTMLElement} */ (found);
  };
  const input = /** @type {HTMLInputElement} */ (part('[data-cmdpalette-input]'));
  const list = part('[data-cmdpalette-list]');
  const hint = part('[data-cmdpalette-hint]');
  const status = part('[data-cmdpalette-status]');
  const close = part('[data-cmdpalette-close]');
  const id = root.dataset['zagId'] ?? 'cmdpalette';

  /** @type {Promise<PaletteSource> | undefined} */
  let loading;
  /** The source, imported once; a failed import is forgotten, so the next query retries. */
  const source = () =>
    (loading ??= importSource().catch((error) => {
      loading = undefined;
      throw error;
    }));
  let latest = 0;
  /** @type {AbortController | undefined} */
  let pending;
  /** @type {HTMLElement[]} */
  let options = [];
  let active = -1;
  /** the rows on screen answer an earlier query while the next one loads: inert until it lands */
  let stale = false;

  /** @param {number} index @param {boolean} [scroll] */
  function highlight(index, scroll = true) {
    active = index;
    options.forEach((option, i) => option.setAttribute('aria-selected', String(i === index)));
    const option = options[index];
    if (option) {
      input.setAttribute('aria-activedescendant', option.id);
      if (scroll) option.scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  }

  /** @param {'count' | 'none' | 'error' | ''} kind @param {string} [text] */
  function say(kind, text = '') {
    status.textContent = text;
    if (kind) status.dataset['kind'] = kind;
    else delete status.dataset['kind'];
  }

  /** @param {boolean} on */
  function setStale(on) {
    stale = on;
    if (on) {
      list.setAttribute('aria-busy', 'true');
      highlight(-1);
    } else list.removeAttribute('aria-busy');
  }

  function clear() {
    setStale(false);
    list.replaceChildren();
    list.hidden = true;
    options = [];
    input.setAttribute('aria-expanded', 'false');
    highlight(-1);
  }

  /** @param {string} template @param {string} name @param {string} value */
  const fill = (template, name, value) => template.replace(`{${name}}`, () => value);

  /** @param {string} query @param {readonly PaletteGroup[]} groups */
  function show(query, groups) {
    clear();
    hint.hidden = true;
    groups.forEach((group, g) => {
      const items = group.items.filter((item) => safeHref(item.href));
      if (!items.length) return;
      const wrap = el('div', 'ocx-cmdpalette__group');
      wrap.setAttribute('role', 'group');
      const label = el('p', 'ocx-cmdpalette__group-label', group.label);
      label.id = `${id}-group-${g}`;
      wrap.setAttribute('aria-labelledby', label.id);
      wrap.append(label);
      for (const item of items) {
        const row = el('a', 'ocx-cmdpalette__option');
        row.setAttribute('href', item.href);
        row.setAttribute('role', 'option');
        row.id = `${id}-option-${options.length}`;
        row.append(el('span', 'ocx-cmdpalette__option-title', item.label));
        if (item.description) row.append(el('span', 'ocx-cmdpalette__option-sub', item.description));
        options.push(row);
        wrap.append(row);
      }
      list.append(wrap);
    });
    if (!options.length) return say('none', fill(root.dataset['noResults'] ?? '', 'query', query));
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    highlight(0);
    say('count', fill(root.dataset['count'] ?? '', 'count', String(options.length)));
  }

  /** The empty query: no rows, no status, the hint. */
  function reset() {
    latest++;
    pending?.abort();
    clear();
    say('');
    hint.hidden = !hint.textContent;
  }

  /** @param {string} value */
  async function search(value) {
    const query = value.trim();
    if (!query) return reset();
    const mine = ++latest;
    pending?.abort();
    if (options.length) setStale(true);
    const controller = (pending = new AbortController());
    try {
      const groups = await (await source()).search(query, controller.signal);
      if (mine === latest) show(query, groups);
    } catch (error) {
      if (mine !== latest) return;
      console.error('[ocx] CommandPalette search failed', error);
      clear();
      hint.hidden = true;
      say('error', root.dataset['error'] ?? '');
    }
  }

  /** @param {Event} event */
  const onOpenChange = (event) => {
    if (event.target !== root) return;
    if (!(/** @type {CustomEvent<{ open: boolean }>} */ (event).detail.open)) {
      latest++;
      pending?.abort();
      return;
    }
    input.value = '';
    reset();
    // The dialog's content is unhidden by the machine's next paint.
    requestAnimationFrame(() => input.focus());
    void source()
      .then((loaded) => loaded.warm?.())
      .catch((error) => console.warn('[ocx] CommandPalette source failed to load on open', error));
  };
  const onInput = () => void search(input.value);
  /** @param {KeyboardEvent} event */
  const onKeydown = (event) => {
    if (event.isComposing) return;
    const row = options[active];
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (options.length && !stale)
        highlight((active + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
    } else if (event.key === 'Enter' && row && !stale) {
      event.preventDefault();
      // A click on the link, so Enter and a mouse pick share one path (and Ctrl/Cmd+Enter opens a new tab).
      row.dispatchEvent(
        new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
        }),
      );
    }
  };
  /** @param {Event} event */
  const optionOf = (event) => {
    const target = event.target instanceof Element ? event.target.closest('[role="option"]') : null;
    return target instanceof HTMLElement ? target : undefined;
  };
  // pointermove, not mouseenter: scrolling a row under a still pointer must not steal the highlight.
  /** @param {PointerEvent} event */
  const onPointerMove = (event) => {
    const index = options.findIndex((option) => option === optionOf(event));
    if (!stale && index >= 0 && index !== active) highlight(index, false);
  };
  /** @param {MouseEvent} event */
  const onClick = (event) => {
    // Close first, then let the browser follow the link: a bfcache Back returns to a closed palette.
    if (stale && optionOf(event)) return event.preventDefault();
    if (optionOf(event) && event.button === 0 && !(event.ctrlKey || event.metaKey || event.shiftKey || event.altKey))
      setOpen(false);
  };
  const onClose = () => setOpen(false);

  root.addEventListener('ocx:dialog:change', onOpenChange);
  input.addEventListener('input', onInput);
  input.addEventListener('keydown', onKeydown);
  list.addEventListener('pointermove', onPointerMove);
  list.addEventListener('click', onClick);
  close.addEventListener('click', onClose);
  return {
    stop() {
      latest++;
      pending?.abort();
      root.removeEventListener('ocx:dialog:change', onOpenChange);
      input.removeEventListener('input', onInput);
      input.removeEventListener('keydown', onKeydown);
      list.removeEventListener('pointermove', onPointerMove);
      list.removeEventListener('click', onClick);
      close.removeEventListener('click', onClose);
    },
  };
}
