// @vitest-environment jsdom
// CommandPalette behaviour (command-palette.mjs + command-palette-session.mjs) under a DOM, on the
// real dialog machine (dialog.zag.mjs). The markup mirrors CommandPalette.astro's SSR, which
// ui-command-palette.test.ts checks. Titles start with the parity-ledger row they pin (D-094..D-107).
import { runInNewContext } from 'node:vm';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { connect, machine, parts } from '../src/components/ui/dialog.zag.mjs';
import { PLATFORM_SCRIPT } from '../src/head-scripts.mjs';
import { mountCommandPalette } from '../src/components/ui/command-palette.mjs';
import type { PaletteGroup, PaletteSource } from '../src/components/ui/command-palette.mjs';
import { ssrApi, ssrAttrs } from '../src/components/ui/zag-runtime.mjs';

const until = async (ok: () => boolean, ms = 2000) => {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
};
const attrs = (a: Record<string, unknown>) =>
  Object.entries(ssrAttrs(a))
    .map(([k, v]) => (v === true ? k : `${k}="${v.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"`))
    .join(' ');

const HINT = 'Search packages by name or keyword, or documentation by title.';
const PACKAGES: PaletteGroup = {
  label: 'Packages',
  items: [
    { href: '/ocx.sh/tools/cmake', label: 'CMake', description: 'ocx.sh/tools/cmake' },
    { href: '/ocx.sh/tools/ninja', label: 'Ninja', description: 'ocx.sh/tools/ninja' },
  ],
};
const DOCS: PaletteGroup = {
  label: 'Docs',
  items: [{ href: '/docs/install/', label: 'Install', description: 'Guides › Install' }],
};

/** The palette as CommandPalette.astro renders it for the defaults, with the hint the catalog passes. */
function place() {
  const api = ssrApi(machine, connect, { defaultOpen: false, modal: true, id: 'pal' });
  const p = parts(api);
  document.body.innerHTML = `<button id="outside">outside</button><input id="other" type="text">
  <div class="ocx-cmdpalette" data-zag-root="dialog" data-zag-state="idle" data-zag-id="pal"
    data-zag-props='{"defaultOpen":false,"modal":true}' data-zag-trigger="manual"
    data-no-results="No results for “{query}”" data-count="{count} results" data-error="Could not load results. Try again.">
    <button type="button" class="ocx-header__search ocx-cmdpalette__trigger" data-cmdpalette-trigger aria-label="Search" aria-haspopup="dialog" aria-expanded="false">Search</button>
    <div class="ocx-cmdpalette__backdrop" ${attrs(p.backdrop)}></div>
    <div class="ocx-cmdpalette__positioner" ${attrs(p.positioner)}>
      <div class="ocx-cmdpalette__content" ${attrs(p.content)}>
        <h2 ${attrs(p.title)}>Search</h2>
        <p ${attrs(p.description)}>Type to search.</p>
        <div class="ocx-cmdpalette__bar">
          <input type="text" class="ocx-cmdpalette__input" id="pal-input" data-cmdpalette-input data-autofocus role="combobox" aria-label="Search"
            aria-expanded="false" aria-controls="pal-list" aria-autocomplete="list" placeholder="Search…">
          <button type="button" class="ocx-cmdpalette__close" data-cmdpalette-close aria-label="Close (Esc)"><kbd>Esc</kbd></button>
        </div>
        <div class="ocx-cmdpalette__results">
          <p class="ocx-cmdpalette__hint" data-cmdpalette-hint>${HINT}</p>
          <p class="ocx-cmdpalette__status" data-cmdpalette-status role="status" aria-live="polite"></p>
          <div class="ocx-cmdpalette__list" id="pal-list" data-cmdpalette-list role="listbox" aria-label="Results" hidden></div>
        </div>
      </div>
    </div>
  </div>`;
  const q = <T extends Element>(selector: string) => document.querySelector<T>(selector)!;
  return {
    root: q<HTMLElement>('.ocx-cmdpalette'),
    trigger: q<HTMLButtonElement>('[data-cmdpalette-trigger]'),
    input: q<HTMLInputElement>('[data-cmdpalette-input]'),
    list: q<HTMLElement>('[data-cmdpalette-list]'),
    hint: q<HTMLElement>('[data-cmdpalette-hint]'),
    status: q<HTMLElement>('[data-cmdpalette-status]'),
    close: q<HTMLButtonElement>('[data-cmdpalette-close]'),
    content: q<HTMLElement>('[data-part="content"]'),
    options: () => [...document.querySelectorAll<HTMLAnchorElement>('[role="option"]')],
  };
}
type Palette = ReturnType<typeof place>;

const key = (target: EventTarget, init: KeyboardEventInit) => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};
const typeInto = (input: HTMLInputElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

const fakeSource = (groups: PaletteGroup[] = [PACKAGES, DOCS]) => {
  const search = vi.fn((query: string) => (query === 'zzz' ? [] : groups));
  const warm = vi.fn();
  return { search, warm, load: vi.fn((): Promise<PaletteSource> => Promise.resolve({ search, warm })) };
};

let mounted: { destroy(): void } | undefined;
const setup = (options: Partial<Parameters<typeof mountCommandPalette>[1]> = {}) => {
  const pal = place();
  const src = fakeSource();
  mounted = mountCommandPalette(pal.root, { source: src.load, ...options });
  return { ...pal, src };
};
const isOpen = (pal: Palette) => !pal.content.hasAttribute('hidden');
const openIt = async (pal: Palette) => {
  pal.trigger.click();
  await until(() => isOpen(pal));
};

const scrollIntoView = vi.fn();
beforeAll(() => {
  Element.prototype.scrollIntoView = scrollIntoView;
});
afterEach(() => {
  mounted?.destroy();
  mounted = undefined;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('opening', () => {
  it('the header trigger opens the dialog and aria-expanded follows it', async () => {
    const pal = setup();
    expect(isOpen(pal)).toBe(false);
    await openIt(pal);
    expect(pal.trigger.getAttribute('aria-expanded')).toBe('true');
    pal.close.click();
    await until(() => !isOpen(pal));
    expect(pal.trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('focus returns to the trigger when Escape closes a palette opened by the trigger', async () => {
    const pal = setup();
    pal.trigger.focus();
    await openIt(pal);
    await until(() => document.activeElement === pal.input);
    key(pal.input, { key: 'Escape' });
    await until(() => !isOpen(pal));
    await until(() => document.activeElement === pal.trigger);
  });

  it('D-098 Mod+K opens, a second press closes, from the page and from inside the palette input', async () => {
    const pal = setup();
    expect(key(document.body, { key: 'k', ctrlKey: true }).defaultPrevented).toBe(true);
    await until(() => isOpen(pal));
    await until(() => document.activeElement === pal.input);
    key(pal.input, { key: 'k', ctrlKey: true });
    await until(() => !isOpen(pal));
    key(document.body, { key: 'K', metaKey: true });
    await until(() => isOpen(pal));
    key(document.body, { key: 'k', metaKey: true });
    await until(() => !isOpen(pal));
  });

  it('D-098 Mod+K is left to the page while typing in some other field', () => {
    const pal = setup();
    const other = document.getElementById('other') as HTMLInputElement;
    other.focus();
    expect(key(other, { key: 'k', ctrlKey: true }).defaultPrevented).toBe(false);
    expect(isOpen(pal)).toBe(false);
  });

  it('D-094 "/" opens the palette when the page has not claimed it', async () => {
    const pal = setup();
    expect(key(document.body, { key: '/' }).defaultPrevented).toBe(true);
    await until(() => isOpen(pal));
    // Open already: a further "/" is not swallowed.
    pal.close.focus();
    expect(key(pal.close, { key: '/' }).defaultPrevented).toBe(false);
  });

  it('D-094 "/" opt-out per page: slash false, a slash function answering false, or a handler that already claimed the key', () => {
    for (const slash of [false, () => false]) {
      const pal = setup({ slash });
      expect(key(document.body, { key: '/' }).defaultPrevented, String(slash)).toBe(false);
      expect(isOpen(pal)).toBe(false);
      mounted?.destroy();
    }
    const pal = setup({ slash: () => true });
    document.addEventListener('keydown', (e) => e.key === '/' && e.preventDefault(), { once: true, capture: true });
    key(document.body, { key: '/' });
    expect(isOpen(pal)).toBe(false);
  });

  it('D-094 "/" is plain text in a field and with a modifier held', () => {
    const pal = setup();
    const other = document.getElementById('other') as HTMLInputElement;
    other.focus();
    expect(key(other, { key: '/' }).defaultPrevented).toBe(false);
    document.getElementById('outside')!.focus();
    expect(key(document.body, { key: '/', ctrlKey: true }).defaultPrevented).toBe(false);
    expect(key(document.body, { key: '/', altKey: true }).defaultPrevented).toBe(false);
    expect(isOpen(pal)).toBe(false);
  });

  it('D-106 the chord is swallowed at once (before any chunk loads) and given back to the browser after a failed load', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const pal = place();
    pal.list.remove(); // the lazy half cannot start without its markup: the same failure as a stale chunk
    mounted = mountCommandPalette(pal.root, { source: fakeSource().load });
    expect(key(document.body, { key: 'k', ctrlKey: true }).defaultPrevented).toBe(true);
    await until(() => error.mock.calls.length > 0);
    expect(key(document.body, { key: 'k', ctrlKey: true }).defaultPrevented).toBe(false);
    expect(key(document.body, { key: '/' }).defaultPrevented).toBe(false);
    expect(isOpen(pal)).toBe(false);
  });

  it('D-106 the source module is not imported before the first open', async () => {
    const pal = setup();
    expect(pal.src.load).not.toHaveBeenCalled();
    await openIt(pal);
    await until(() => pal.src.load.mock.calls.length === 1);
    expect(pal.src.warm).toHaveBeenCalledTimes(1);
  });

  it('destroy removes the shortcuts', () => {
    const pal = setup();
    mounted?.destroy();
    mounted = undefined;
    expect(key(document.body, { key: 'k', ctrlKey: true }).defaultPrevented).toBe(false);
    pal.trigger.click();
    expect(isOpen(pal)).toBe(false);
  });

  it('aria-keyshortcuts names Meta+K on a mac page only, as Search does', () => {
    document.documentElement.dataset['platform'] = 'mac';
    try {
      expect(setup().trigger.getAttribute('aria-keyshortcuts')).toBe('Meta+K');
    } finally {
      delete document.documentElement.dataset['platform'];
    }
    mounted?.destroy();
    const other = setup();
    other.trigger.setAttribute('aria-keyshortcuts', 'Control+K');
    expect(other.trigger.getAttribute('aria-keyshortcuts')).toBe('Control+K');
  });

  it('a root without a trigger is a wiring error', () => {
    document.body.innerHTML = '<div id="r"></div>';
    expect(() => mountCommandPalette(document.getElementById('r')!, { source: fakeSource().load })).toThrow(/trigger/);
  });
});

describe('the open dialog', () => {
  it('D-096 once live the dialog is named by its title and described by the hidden description', async () => {
    const pal = setup();
    await openIt(pal);
    const title = pal.content.querySelector('[data-part="title"]')!;
    const description = pal.content.querySelector('[data-part="description"]')!;
    expect(pal.content.getAttribute('role')).toBe('dialog');
    expect(pal.content.getAttribute('aria-labelledby')).toBe(title.id);
    expect(pal.content.getAttribute('aria-describedby')).toBe(description.id);
  });

  it('D-099 every open starts clean: empty query, no rows, no status, the hint back, input focused', async () => {
    const pal = setup();
    await openIt(pal);
    typeInto(pal.input, 'cm');
    await until(() => pal.options().length === 3);
    pal.close.click();
    await until(() => !isOpen(pal));
    await openIt(pal);
    expect(pal.input.value).toBe('');
    expect(pal.options()).toHaveLength(0);
    expect(pal.list.hasAttribute('hidden')).toBe(true);
    expect(pal.status.textContent).toBe('');
    expect(pal.hint.hidden).toBe(false);
    expect(pal.input.hasAttribute('aria-activedescendant')).toBe(false);
    await until(() => document.activeElement === pal.input);
  });

  it('D-099 an error from the last session does not survive a reopen', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const src = fakeSource();
    src.search.mockImplementationOnce(() => {
      throw new Error('offline');
    });
    const pal = place();
    mounted = mountCommandPalette(pal.root, { source: src.load });
    await openIt(pal);
    typeInto(pal.input, 'cm');
    await until(() => pal.status.textContent !== '');
    expect(error).toHaveBeenCalledWith('[ocx] CommandPalette search failed', expect.any(Error));
    pal.close.click();
    await until(() => !isOpen(pal));
    await openIt(pal);
    expect(pal.status.textContent).toBe('');
  });

  it('D-100 the empty-query hint shows with no query, hides while results show and returns when the query is cleared', async () => {
    const pal = setup();
    await openIt(pal);
    expect(pal.hint.textContent).toBe(HINT);
    expect(pal.hint.hidden).toBe(false);
    typeInto(pal.input, 'cm');
    await until(() => pal.options().length > 0);
    expect(pal.hint.hidden).toBe(true);
    typeInto(pal.input, '  ');
    expect(pal.options()).toHaveLength(0);
    expect(pal.hint.hidden).toBe(false);
  });

  it('D-100 an empty hint prop leaves nothing to show', async () => {
    const pal = setup();
    pal.hint.textContent = '';
    pal.hint.hidden = true;
    await openIt(pal);
    expect(pal.hint.hidden).toBe(true);
  });

  it('D-104 Escape closes in one press, with text typed', async () => {
    const pal = setup();
    await openIt(pal);
    typeInto(pal.input, 'cmake');
    await until(() => pal.options().length > 0);
    key(pal.input, { key: 'Escape' });
    await until(() => !isOpen(pal));
  });

  it('D-104 the visible Esc button closes', async () => {
    const pal = setup();
    await openIt(pal);
    pal.close.click();
    await until(() => !isOpen(pal));
  });
});

describe('results', () => {
  it('draws one labelled group per source group, rows as real links with a muted second line', async () => {
    const pal = setup();
    await openIt(pal);
    typeInto(pal.input, 'cm');
    await until(() => pal.options().length === 3);
    expect(pal.src.search).toHaveBeenLastCalledWith('cm', expect.any(AbortSignal));
    const groups = [...pal.list.querySelectorAll('[role="group"]')];
    expect(groups.map((g) => g.querySelector('.ocx-cmdpalette__group-label')?.textContent)).toEqual([
      'Packages',
      'Docs',
    ]);
    for (const group of groups)
      expect(group.getAttribute('aria-labelledby')).toBe(group.querySelector('.ocx-cmdpalette__group-label')!.id);
    const [cmake] = pal.options();
    expect(cmake!.tagName).toBe('A');
    expect(cmake!.getAttribute('href')).toBe('/ocx.sh/tools/cmake');
    expect(cmake!.querySelector('.ocx-cmdpalette__option-title')?.textContent).toBe('CMake');
    expect(cmake!.querySelector('.ocx-cmdpalette__option-sub')?.textContent).toBe('ocx.sh/tools/cmake');
    expect(pal.list.hasAttribute('hidden')).toBe(false);
    expect(pal.input.getAttribute('aria-expanded')).toBe('true');
    expect(pal.status.textContent).toBe('3 results');
    expect(pal.status.dataset['kind']).toBe('count');
  });

  it('D-101 rows are real links (href on each), so middle click and copy link address work', async () => {
    const pal = setup();
    await openIt(pal);
    typeInto(pal.input, 'cm');
    await until(() => pal.options().length === 3);
    expect(pal.options().map((o) => o.getAttribute('href'))).toEqual([
      '/ocx.sh/tools/cmake',
      '/ocx.sh/tools/ninja',
      '/docs/install/',
    ]);
    expect(pal.options().every((o) => o.matches('a[href][role="option"]'))).toBe(true);
  });

  it('writes text, never HTML, and drops rows whose href is not http(s) or relative', async () => {
    const src = fakeSource([
      {
        label: 'Packages',
        items: [
          { href: '/ok', label: '<img src=x onerror=alert(1)>', description: '<b>bold</b>' },
          { href: 'javascript:alert(1)', label: 'bad' },
          { href: 'data:text/html,x', label: 'bad too' },
          { href: 'http://[bad', label: 'unparsable' },
          { href: 'https://example.com/x', label: 'abs' },
        ],
      },
      { label: 'Docs', items: [{ href: 'javascript:alert(2)', label: 'only bad' }] },
    ]);
    const pal = place();
    mounted = mountCommandPalette(pal.root, { source: src.load });
    await openIt(pal);
    typeInto(pal.input, 'x');
    await until(() => pal.options().length === 2);
    expect(pal.list.querySelector('img, b')).toBeNull();
    expect(pal.options()[0]!.textContent).toBe('<img src=x onerror=alert(1)><b>bold</b>');
    expect(pal.list.querySelectorAll('[role="group"]')).toHaveLength(1);
  });

  it('a query without rows says so in the status line, quoting the query as text', async () => {
    const pal = setup();
    await openIt(pal);
    typeInto(pal.input, 'zzz');
    await until(() => pal.status.textContent !== '');
    expect(pal.status.textContent).toBe('No results for “zzz”');
    expect(pal.status.dataset['kind']).toBe('none');
    expect(pal.list.hasAttribute('hidden')).toBe(true);
    expect(pal.input.getAttribute('aria-expanded')).toBe('false');
    expect(pal.hint.hidden).toBe(true);
  });

  it('a failing source shows the error inline and the next query retries the import', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const pal = place();
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline')) // the warm-up on open
      .mockRejectedValueOnce(new Error('offline')) // the first query
      .mockResolvedValue({ search: () => [PACKAGES] });
    mounted = mountCommandPalette(pal.root, { source: load });
    await openIt(pal);
    typeInto(pal.input, 'cm');
    await until(() => pal.status.dataset['kind'] === 'error');
    expect(pal.status.textContent).toBe('Could not load results. Try again.');
    expect(error).toHaveBeenCalledWith('[ocx] CommandPalette search failed', expect.any(Error));
    expect(warn).toHaveBeenCalledWith('[ocx] CommandPalette source failed to load on open', expect.any(Error));
    typeInto(pal.input, 'cma');
    await until(() => pal.options().length === 2);
    expect(pal.status.dataset['kind']).toBe('count');
    expect(load).toHaveBeenCalledTimes(3); // open (warm), first query, retry
  });

  it('a slower, older query never overwrites a newer one, and its signal is aborted', async () => {
    const signals: AbortSignal[] = [];
    let release: (groups: PaletteGroup[]) => void = () => {};
    const search = vi.fn((query: string, signal: AbortSignal) => {
      signals.push(signal);
      return query === 'a' ? new Promise<PaletteGroup[]>((resolve) => (release = resolve)) : Promise.resolve([DOCS]);
    });
    const pal = place();
    mounted = mountCommandPalette(pal.root, { source: () => Promise.resolve({ search }) });
    await openIt(pal);
    typeInto(pal.input, 'a');
    await until(() => search.mock.calls.length === 1);
    typeInto(pal.input, 'ab');
    await until(() => pal.options().length === 1);
    expect(signals[0]!.aborted).toBe(true);
    release([PACKAGES]);
    await new Promise((r) => setTimeout(r, 30));
    expect(pal.options().map((o) => o.textContent)).toEqual(['InstallGuides › Install']);
  });
});

describe('late results and stale rows', () => {
  it('a source that ignores abort cannot overwrite a closed palette, on success or error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const releases: Array<{ ok: (g: PaletteGroup[]) => void; fail: (e: Error) => void }> = [];
    const search = vi.fn(() => new Promise<PaletteGroup[]>((ok, fail) => releases.push({ ok, fail })));
    const pal = place();
    mounted = mountCommandPalette(pal.root, { source: () => Promise.resolve({ search }) });
    await openIt(pal);
    typeInto(pal.input, 'a');
    typeInto(pal.input, 'ab');
    await until(() => releases.length === 2);
    pal.close.click();
    await until(() => !isOpen(pal));
    releases[0]!.ok([PACKAGES]);
    releases[1]!.fail(new Error('late'));
    await new Promise((r) => setTimeout(r, 30));
    expect(pal.options()).toHaveLength(0);
    expect(pal.status.dataset['kind']).toBeUndefined();
  });

  it('previous rows are inert while the next query loads: no active descendant, Enter does nothing', async () => {
    let release: (g: PaletteGroup[]) => void = () => {};
    const search = vi
      .fn()
      .mockReturnValueOnce([PACKAGES])
      .mockReturnValueOnce(new Promise<PaletteGroup[]>((resolve) => (release = resolve)));
    const pal = place();
    mounted = mountCommandPalette(pal.root, { source: () => Promise.resolve({ search }) });
    await openIt(pal);
    typeInto(pal.input, 'cm');
    await until(() => pal.options().length === 2);
    const click = vi.fn((e: Event) => e.preventDefault());
    pal.list.addEventListener('click', click);
    typeInto(pal.input, 'nin');
    await until(() => search.mock.calls.length === 2);
    expect(pal.options()).toHaveLength(2); // still drawn: no flicker
    expect(pal.list.getAttribute('aria-busy')).toBe('true');
    expect(pal.input.hasAttribute('aria-activedescendant')).toBe(false);
    key(pal.input, { key: 'Enter' });
    expect(click).not.toHaveBeenCalled();
    release([DOCS]);
    await until(() => pal.options().length === 1);
    expect(pal.list.hasAttribute('aria-busy')).toBe(false);
    expect(pal.input.getAttribute('aria-activedescendant')).toBe(pal.options()[0]!.id);
  });

  it('destroying during the initial load starts no session and fires no search', async () => {
    const pal = place();
    const search = vi.fn(() => [PACKAGES]);
    mounted = mountCommandPalette(pal.root, { source: () => Promise.resolve({ search }) });
    pal.trigger.click();
    mounted.destroy();
    await new Promise((r) => setTimeout(r, 50));
    typeInto(pal.input, 'cm');
    await new Promise((r) => setTimeout(r, 30));
    expect(search).not.toHaveBeenCalled();
  });
});

describe('keyboard and pointer selection', () => {
  const withResults = async () => {
    const pal = setup();
    await openIt(pal);
    typeInto(pal.input, 'cm');
    await until(() => pal.options().length === 3);
    return pal;
  };
  const selected = (pal: Palette) => pal.options().map((o) => o.getAttribute('aria-selected'));

  it("D-095 the first row is highlighted by default and is the input's active descendant", async () => {
    const pal = await withResults();
    expect(selected(pal)).toEqual(['true', 'false', 'false']);
    expect(pal.input.getAttribute('aria-activedescendant')).toBe(pal.options()[0]!.id);
  });

  it('D-095 ArrowDown and ArrowUp move the highlight from the input and wrap at both ends', async () => {
    const pal = await withResults();
    expect(key(pal.input, { key: 'ArrowDown' }).defaultPrevented).toBe(true);
    expect(selected(pal)).toEqual(['false', 'true', 'false']);
    key(pal.input, { key: 'ArrowDown' });
    key(pal.input, { key: 'ArrowDown' });
    expect(selected(pal)).toEqual(['true', 'false', 'false']);
    key(pal.input, { key: 'ArrowUp' });
    expect(selected(pal)).toEqual(['false', 'false', 'true']);
    expect(pal.input.getAttribute('aria-activedescendant')).toBe(pal.options()[2]!.id);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
  });

  it('D-095 hovering a row sets the highlight without scrolling; the same row twice is a no-op', async () => {
    const pal = await withResults();
    scrollIntoView.mockClear();
    const [, ninja] = pal.options();
    ninja!.querySelector('span')!.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
    expect(selected(pal)).toEqual(['false', 'true', 'false']);
    ninja!.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
    pal.list.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
    expect(selected(pal)).toEqual(['false', 'true', 'false']);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('D-095 Enter opens the highlighted row, not always the first (after an arrow move or a hover)', async () => {
    const pal = await withResults();
    const clicked: string[] = [];
    document.addEventListener('click', (event) => {
      const row = (event.target as Element).closest('a');
      if (row) {
        clicked.push(row.getAttribute('href')!);
        event.preventDefault(); // jsdom cannot navigate
      }
    });
    key(pal.input, { key: 'ArrowDown' });
    key(pal.input, { key: 'Enter' });
    pal.options()[2]!.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
    key(pal.input, { key: 'Enter' });
    expect(clicked).toEqual(['/ocx.sh/tools/ninja', '/docs/install/']);
  });

  it('D-095 Enter and the arrows do nothing without rows, and wait for an IME composition to end', async () => {
    const pal = setup();
    await openIt(pal);
    expect(key(pal.input, { key: 'Enter' }).defaultPrevented).toBe(false);
    expect(key(pal.input, { key: 'ArrowDown' }).defaultPrevented).toBe(true);
    expect(pal.input.hasAttribute('aria-activedescendant')).toBe(false);
    typeInto(pal.input, 'cm');
    await until(() => pal.options().length === 3);
    expect(key(pal.input, { key: 'ArrowDown', isComposing: true }).defaultPrevented).toBe(false);
    expect(key(pal.input, { key: 'Enter', isComposing: true }).defaultPrevented).toBe(false);
  });

  it('D-102 picking a row closes the palette before the browser follows the link', async () => {
    const pal = await withResults();
    let expandedWhenFollowed: string | null | undefined;
    document.addEventListener('click', (event) => {
      if ((event.target as Element).closest('a')) {
        // The machine settles in a microtask of this click; the browser's navigation is a later task.
        queueMicrotask(() => (expandedWhenFollowed = pal.trigger.getAttribute('aria-expanded')));
        event.preventDefault();
      }
    });
    pal.options()[1]!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(expandedWhenFollowed).toBe('false');
    await until(() => !isOpen(pal));
  });

  it('D-102 Enter on the highlighted row also closes first', async () => {
    const pal = await withResults();
    document.addEventListener('click', (event) => (event.target as Element).closest('a') && event.preventDefault());
    key(pal.input, { key: 'Enter' });
    await until(() => !isOpen(pal));
  });

  it('D-101 a modified click (new tab) keeps the palette open', async () => {
    const pal = await withResults();
    document.addEventListener('click', (event) => (event.target as Element).closest('a') && event.preventDefault());
    pal.options()[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
    pal.options()[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 1 }));
    await new Promise((r) => setTimeout(r, 30));
    expect(isOpen(pal)).toBe(true);
  });

  it('a click on the list between rows does nothing', async () => {
    const pal = await withResults();
    pal.list.click();
    await new Promise((r) => setTimeout(r, 30));
    expect(isOpen(pal)).toBe(true);
  });
});

describe('D-107 Apple platforms get the Command glyph', () => {
  const platformFor = (platform: string, userAgentData?: { platform: string }) => {
    const documentElement = { dataset: {} as Record<string, string> };
    runInNewContext(PLATFORM_SCRIPT, { navigator: { platform, userAgentData }, document: { documentElement } });
    return documentElement.dataset['platform'];
  };

  it.each(['MacIntel', 'macOS', 'iPhone', 'iPad', 'iPod touch'])('%s is mac', (platform) => {
    expect(platformFor(platform)).toBe('mac');
  });

  it('other platforms keep Ctrl, and userAgentData wins over the deprecated platform', () => {
    expect(platformFor('Linux x86_64')).toBe('linux');
    expect(platformFor('Win32')).toBe('windows');
    expect(platformFor('Win32', { platform: 'macOS' })).toBe('mac');
  });
});
