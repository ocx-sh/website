// WP13.1 Terminal: markup (Container API) and the terminal.mjs client logic
// (jsdom; fetch, the player import, IntersectionObserver and matchMedia stubbed).
// C-142: a collapsed terminal toggles through the real Zag collapsible; the harness hydrates it
// (hover → live) and each toggle waits for the machine (it sends in a microtask and ends
// `closing` on the next animation frame). The aria-expanded / hidden assertions are unchanged.
import { readFileSync } from 'node:fs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { withBase } from '../src/components/base-url.mjs';
import { loadDefault, mountTerminal } from '../src/components/terminal.mjs';

// Only loadDefault touches these; the client tests inject their own loader.
vi.mock('asciinema-player', () => ({ create: vi.fn() }));
vi.mock('../src/components/terminal-player.css?url', () => ({ default: '/player.css' }));

type Win = Window & typeof globalThis;
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: Win } };
type Props = Record<string, unknown>;
type Component = Parameters<AstroContainer['renderToString']>[0];
const load = async (): Promise<Component> =>
  ((await import(`../src/components/${'Terminal'}.astro`)) as { default: Component }).default;

const CAST = '{"version": 2, "width": 100, "height": 8}\n[0.0, "o", "$ ocx"]\n';
// The example's `base` (vitest runs on its Astro config, see vitest.config.ts).
const BASE = '/docs/';

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function render(props: Props): Promise<{ win: Win; root: HTMLElement }> {
  const html = await container.renderToString(await load(), { props });
  const { window: win } = new JSDOM(`<!doctype html><body>${html}</body>`);
  const root = win.document.querySelector<HTMLElement>('.ocx-terminal');
  if (!root) throw new Error('no .ocx-terminal rendered');
  return { win, root };
}

const options = (root: HTMLElement): Record<string, unknown> =>
  JSON.parse(root.dataset['options'] ?? 'null') as Record<string, unknown>;

// ── forced colors (review #14) ──────────────────────────────────────────── //

describe('Terminal seek bar in forced-colors mode', () => {
  it('paints track and thumb with system colors, since the gradient and thumb fill are dropped', () => {
    const src = readFileSync(new URL('../src/components/Terminal.astro', import.meta.url), 'utf8');
    const block = /@media \(forced-colors: active\) \{([\s\S]*?)\n {4}\}\n/.exec(src)?.[1] ?? '';
    expect(block).toMatch(/seek::-webkit-slider-runnable-track[\s\S]*background: GrayText/);
    expect(block).toMatch(/seek::-moz-range-track/);
    expect(block).toMatch(/seek::-webkit-slider-thumb[\s\S]*background: CanvasText/);
    expect(block).toMatch(/seek::-moz-range-thumb/);
    expect(block).not.toMatch(/visibility/); // the disabled thumb stays hidden
  });
});

// ── chevron + start overlay styles ──────────────────────────────────────── //

describe('Terminal chevron and start overlay styles', () => {
  const src = readFileSync(new URL('../src/components/Terminal.astro', import.meta.url), 'utf8');
  const rule = (sel: string): string =>
    new RegExp(`\\n {4}${sel.replace(/[.[\]']/g, '\\$&')} \\{([^}]*)\\}`).exec(src)?.[1] ?? '';

  it('centres the chevron on the chrome line and turns it about its own centre, on a token duration', () => {
    const chevron = rule('.ocx-terminal__chevron');
    expect(chevron).toMatch(/align-self: center/);
    expect(chevron).toMatch(/transform-origin: center/);
    expect(chevron).toMatch(/transition: rotate var\(--ocx-duration-moderate\)/); // reduced motion zeroes the token
    expect(rule("[aria-expanded='true'] > .ocx-terminal__chevron")).toMatch(/rotate: 180deg/);
    expect(rule('.ocx-terminal__chrome')).toMatch(/align-items: center/);
    expect(src).not.toMatch(/border-right:[^;]*accent-fg/); // the drawn corner chevron is gone
  });

  it("hides asciinema's start overlay and pins ours over the poster, above the control bar", () => {
    expect(src).toMatch(/\.ocx-terminal__player \.ap-overlay-start \{\s*display: none/);
    expect(rule('.ocx-terminal__start')).toMatch(/inset: 0 0 var\(--ocx-control-xl\)/);
    expect(rule('.ocx-terminal__start')).toMatch(/place-items: center/);
  });

  it('R5 the overlay fades out (display allow-discrete); the control glyphs crossfade only when live', () => {
    expect(rule('.ocx-terminal__start')).toMatch(/opacity var\(--ocx-duration-base\) var\(--ocx-ease-out\)/);
    expect(rule('.ocx-terminal__start')).toMatch(/display var\(--ocx-duration-base\) allow-discrete/);
    expect(rule('.ocx-terminal__start[hidden]')).toMatch(/display: none;\s*opacity: 0;/);
    expect(rule('.ocx-terminal__start-button')).toMatch(/transition: color var\(--ocx-duration-base\)/);
    expect(src).toMatch(/\.ocx-terminal\[data-live\] \.ocx-terminal__controls svg \{\s*transition:/);
    expect(src).not.toMatch(/__(pause|play|fs|fs-exit)-icon[^{]*\{\s*display:/);
  });
});

// ── markup ──────────────────────────────────────────────────────────────── //

describe('WP13.1 Terminal markup', () => {
  it('WP13.1 Terminal: chrome renders three decorative dots and the optional title (146611f12)', async () => {
    const { root } = await render({ src: '/casts/x.cast', title: 'Installing a package' });
    const dots = root.querySelectorAll('.ocx-terminal__chrome .ocx-terminal__dot');
    expect(dots).toHaveLength(3);
    for (const d of dots) expect(d.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(root.querySelector('.ocx-terminal__title')?.textContent.trim()).toBe('Installing a package');
    expect((await render({ src: '/casts/x.cast' })).root.querySelector('.ocx-terminal__title')).toBeNull();
  });

  it('WP13.1 Terminal: collapsed chrome is a real <button aria-expanded="false" aria-controls> with a chevron (WP13.1)', async () => {
    const { root } = await render({ src: '/casts/x.cast', title: 'T', collapsed: true });
    const button = root.querySelector('button.ocx-terminal__chrome');
    expect(button?.getAttribute('type')).toBe('button');
    expect(button?.getAttribute('aria-expanded')).toBe('false');
    const player = root.querySelector('.ocx-terminal__player');
    expect(player?.id).toBeTruthy();
    expect(button?.getAttribute('aria-controls')).toBe(player?.id);
    expect(player?.hasAttribute('hidden')).toBe(true);
    expect(root.querySelector('.ocx-terminal__chevron')).not.toBeNull();
  });

  it('WP13.1 Terminal: an open terminal has no toggle button and reserves its height from rows (WP13.1 CLS)', async () => {
    const { root } = await render({ src: '/casts/x.cast', cols: 100, rows: 19 });
    expect(root.querySelector('.ocx-terminal__chrome button')).toBeNull();
    expect(root.querySelector('[aria-expanded]')).toBeNull();
    const player = root.querySelector('.ocx-terminal__player');
    expect(player?.hasAttribute('hidden')).toBe(false);
    expect(player?.getAttribute('style') ?? '').toMatch(/--_rows:\s*19\b/);
    // fit width scales with the container: the reserve needs the column count too (any width, incl. mobile).
    expect(player?.getAttribute('style') ?? '').toMatch(/--_cols:\s*100\b/);
  });

  it('renders our start overlay in SSR: a bare button named "Play <title>" with the play icon', async () => {
    const { root } = await render({ src: '/casts/x.cast', title: 'Installing a package', collapsed: true });
    const btn = root.querySelector('.ocx-terminal__start button.ocx-terminal__start-button');
    expect(btn?.getAttribute('aria-label')).toBe('Play Installing a package');
    expect(btn?.getAttribute('type')).toBe('button');
    expect(btn?.querySelector('svg[data-icon="play"]')).not.toBeNull();
    expect(root.querySelector('.ocx-terminal__start')?.hasAttribute('hidden')).toBe(false);
    const untitled = await render({ src: '/casts/x.cast' });
    expect(untitled.root.querySelector('.ocx-terminal__start button')?.getAttribute('aria-label')).toBe(
      'Play terminal recording',
    );
  });

  it('renders no start overlay with autoPlay', async () => {
    expect(
      (await render({ src: '/casts/x.cast', autoPlay: true })).root.querySelector('.ocx-terminal__start'),
    ).toBeNull();
  });

  it('the chevron is the chevron-down registry icon, not a drawn shape', async () => {
    const { root } = await render({ src: '/casts/x.cast', collapsed: true });
    expect(root.querySelector('svg.ocx-terminal__chevron[data-icon="chevron-down"]')).not.toBeNull();
  });

  it('WP13.1 Terminal: src resolves against BASE_URL into data-src (WP13.1)', async () => {
    expect((await render({ src: '/casts/a/b.cast' })).root.dataset['src']).toBe(withBase('/casts/a/b.cast', BASE));
    expect((await render({ src: '/casts/a/b.cast' })).root.dataset['src']).toBe(
      `${BASE.replace(/\/$/, '')}/casts/a/b.cast`,
    );
  });

  it('WP13.1 Terminal: defaults to no autoplay for a src, speed 1, idleTimeLimit 2, loop off, fit width (DOC-EX-15)', async () => {
    const { root } = await render({ src: '/casts/x.cast' });
    expect(options(root)).toMatchObject({ autoPlay: false, speed: 1, idleTimeLimit: 2, loop: false, fit: 'width' });
  });

  it('WP13.1 Terminal: passes cols/rows/speed/idleTimeLimit/loop/autoPlay through and maps fit "none" to false (146611f12)', async () => {
    const { root } = await render({
      src: '/casts/x.cast',
      cols: 80,
      rows: 10,
      speed: 2,
      idleTimeLimit: 1,
      loop: true,
      autoPlay: true,
      fit: 'none',
    });
    expect(options(root)).toEqual({
      cols: 80,
      rows: 10,
      speed: 2,
      idleTimeLimit: 1,
      loop: true,
      autoPlay: true,
      fit: false,
    });
  });
});

// ── client logic ────────────────────────────────────────────────────────── //

interface Harness {
  root: HTMLElement;
  fetchMock: ReturnType<typeof vi.fn>;
  load: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  player: {
    play: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
    seek: ReturnType<typeof vi.fn<() => Promise<void>>>;
    dispose: ReturnType<typeof vi.fn>;
    getCurrentTime: ReturnType<typeof vi.fn>;
    getDuration: ReturnType<typeof vi.fn>;
    addEventListener: ReturnType<typeof vi.fn>;
  };
  /** Dispatch a player event (metadata, play, pause, playing, ended, seeked) to its listeners. */
  emit: (name: string, data?: unknown) => void;
  scroll: ReturnType<typeof vi.fn>;
  intersect: (isIntersecting: boolean) => void;
  button: () => HTMLButtonElement;
  /** Click the chrome button and let the machine settle. */
  toggle: () => Promise<void>;
}

// Several macrotasks: Zag sends in a microtask and ends `closing` on the next animation frame.
const settle = async () => {
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
};

async function mount(
  props: Props,
  env: { reducedMotion?: boolean; fetchFails?: boolean; fonts?: Promise<unknown>; createThrows?: boolean } = {},
): Promise<Harness> {
  const { win, root } = await render(props);
  if (env.fonts) Object.defineProperty(win.document, 'fonts', { value: { ready: env.fonts } });
  vi.stubGlobal('document', win.document);
  const fetchMock = vi.fn(() =>
    Promise.resolve(env.fetchFails ? new Response('nope', { status: 404 }) : new Response(CAST, { status: 200 })),
  );
  vi.stubGlobal('fetch', fetchMock);
  const matchMedia = vi.fn((q: string) => ({
    matches: !!env.reducedMotion && q.includes('prefers-reduced-motion') && q.includes('reduce'),
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.stubGlobal('matchMedia', matchMedia);
  win.matchMedia = matchMedia as unknown as Win['matchMedia'];
  const observers: { cb: IntersectionObserverCallback; targets: Element[] }[] = [];
  class IO {
    cb: IntersectionObserverCallback;
    targets: Element[] = [];
    constructor(cb: IntersectionObserverCallback) {
      this.cb = cb;
      observers.push(this);
    }
    observe(el: Element) {
      this.targets.push(el);
    }
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  vi.stubGlobal('IntersectionObserver', IO);
  (win as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IO;
  const scroll = vi.fn();
  win.HTMLElement.prototype.scrollIntoView = scroll;
  const listeners = new Map<string, Array<(data?: unknown) => void>>();
  const player = {
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(() => Promise.resolve()),
    seek: vi.fn(() => Promise.resolve()),
    dispose: vi.fn(),
    getCurrentTime: vi.fn(() => Promise.resolve(0)),
    getDuration: vi.fn(() => Promise.resolve(0)),
    addEventListener: vi.fn((name: string, cb: (data?: unknown) => void) => {
      const cbs = listeners.get(name) ?? [];
      cbs.push(cb);
      listeners.set(name, cbs);
    }),
  };
  const emit = (name: string, data?: unknown) => listeners.get(name)?.forEach((cb) => cb(data));
  const create = vi.fn((_src: unknown, el: HTMLElement) => {
    if (env.createThrows) throw new Error('bad cast');
    el.append(win.document.createElement('div'));
    return player;
  });
  const load = vi.fn(() => Promise.resolve({ create }));
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  vi.stubGlobal('CustomEvent', win.CustomEvent); // emit() builds events from the global
  mountTerminal(root, load);
  if (root.dataset['zagRoot']) {
    root.dispatchEvent(new win.Event('pointerenter'));
    await vi.waitFor(() => expect(root.dataset['zagState']).toBe('live'));
  }
  const button = () => {
    const b = root.querySelector<HTMLButtonElement>('button.ocx-terminal__chrome');
    if (!b) throw new Error('no chrome button');
    return b;
  };
  return {
    root,
    fetchMock,
    load,
    create,
    player,
    emit,
    scroll,
    intersect: (isIntersecting) => {
      for (const o of observers)
        o.cb(
          o.targets.map(
            (target) =>
              ({
                target,
                isIntersecting,
                intersectionRatio: isIntersecting ? 1 : 0,
              }) as unknown as IntersectionObserverEntry,
          ),
          o as unknown as IntersectionObserver,
        );
    },
    button,
    toggle: async () => {
      button().click();
      await settle();
    },
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const createOpts = (h: Harness) => h.create.mock.calls[0]?.[2] as Record<string, unknown>;
const interact = (h: Harness, type = 'pointerenter') => {
  const W = h.root.ownerDocument.defaultView as unknown as { Event: typeof Event };
  h.root.dispatchEvent(new W.Event(type, { bubbles: true }));
};

describe('WP13.1 Terminal client', () => {
  it('start overlay: a click hides it and starts playback through the create path (open terminal)', async () => {
    const h = await mount({ src: '/casts/x.cast', rows: 8 });
    const start = h.root.querySelector<HTMLElement>('.ocx-terminal__start');
    start?.querySelector<HTMLElement>('button')?.click(); // bubbles to the overlay
    expect(start?.hidden).toBe(true);
    await vi.waitFor(() => expect(h.create).toHaveBeenCalledTimes(1));
    expect(createOpts(h)['autoPlay']).toBe(false);
    await vi.waitFor(() => expect(h.player.play).toHaveBeenCalledTimes(1));
  });

  it('start overlay: stays until playback starts, hides on the player play event', async () => {
    const h = await mount({ src: '/casts/x.cast', rows: 8 });
    interact(h);
    await vi.waitFor(() => expect(h.create).toHaveBeenCalledTimes(1));
    const start = h.root.querySelector<HTMLElement>('.ocx-terminal__start');
    expect(start?.hidden).toBe(false);
    h.emit('play');
    expect(start?.hidden).toBe(true);
    h.emit('pause'); // stops the seek-bar frame loop before the rAF stub goes
  });

  it('start overlay: expanding a collapsed terminal hides it (playback follows), reduced motion keeps it', async () => {
    const h = await mount({ src: '/casts/x.cast', collapsed: true });
    await h.toggle();
    expect(h.root.querySelector<HTMLElement>('.ocx-terminal__start')?.hidden).toBe(true);
    const r = await mount({ src: '/casts/x.cast', collapsed: true }, { reducedMotion: true });
    await r.toggle();
    await vi.waitFor(() => expect(r.create).toHaveBeenCalledTimes(1));
    expect(r.root.querySelector<HTMLElement>('.ocx-terminal__start')?.hidden).toBe(false);
  });

  it('WP13.1 Terminal: prefetches the cast on mount, not on first click, even when collapsed (2210983da)', async () => {
    const h = await mount({ src: '/casts/x.cast', collapsed: true });
    expect(h.fetchMock).toHaveBeenCalledTimes(1);
    expect(String(h.fetchMock.mock.calls[0]?.[0])).toBe(h.root.dataset['src']);
  });

  it('WP13.1 Terminal: collapsed terminal does not import the player before the first expand (Lighthouse)', async () => {
    const h = await mount({ src: '/casts/x.cast', collapsed: true });
    h.intersect(true);
    await flush();
    expect(h.load).not.toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled();
  });

  it.each(['pointerenter', 'focusin', 'touchstart'])(
    'WP13.1 Terminal: open terminal imports the player on first %s, not on mount or in view, without autoplay (DOC-EX-15)',
    async (type) => {
      const h = await mount({ src: '/casts/x.cast', rows: 8 });
      h.intersect(true);
      await flush();
      expect(h.load).not.toHaveBeenCalled();
      interact(h, type);
      interact(h, type); // one-shot: a second interaction creates nothing new
      await vi.waitFor(() => expect(h.create).toHaveBeenCalledTimes(1));
      expect(h.load).toHaveBeenCalledTimes(1);
      expect(createOpts(h)['autoPlay']).toBe(false);
      expect(h.player.play).not.toHaveBeenCalled();
    },
  );

  it('WP13.1 Terminal: open terminal with autoPlay creates the player as it nears the viewport and autoplays', async () => {
    const h = await mount({ src: '/casts/x.cast', rows: 8, autoPlay: true });
    await flush();
    expect(h.load).not.toHaveBeenCalled();
    h.intersect(true);
    await vi.waitFor(() => expect(h.create).toHaveBeenCalledTimes(1));
    expect(createOpts(h)['autoPlay']).toBe(true);
  });

  it('WP13.1 Terminal: the player is created from the prefetched data, with no second fetch (2210983da)', async () => {
    const h = await mount({ src: '/casts/x.cast', collapsed: true });
    await h.toggle();
    await vi.waitFor(() => expect(h.create).toHaveBeenCalledTimes(1));
    expect(h.create.mock.calls[0]?.[0]).toEqual({ data: CAST });
    expect(h.create.mock.calls[0]?.[1]).toBe(h.root.querySelector('.ocx-terminal__player'));
    expect(h.fetchMock).toHaveBeenCalledTimes(1);
  });

  it('WP13.1 Terminal: player gets the ocx theme, the mono token font, and its native controls stay off (WP13.2)', async () => {
    const h = await mount({ src: '/casts/x.cast', collapsed: true, cols: 80, rows: 10, fit: 'none', speed: 2 });
    await h.toggle();
    await vi.waitFor(() => expect(h.create).toHaveBeenCalledTimes(1));
    const o = createOpts(h);
    expect(o).toMatchObject({
      theme: 'ocx',
      terminalFontFamily: 'var(--ocx-font-mono)',
      cols: 80,
      rows: 10,
      fit: false,
      speed: 2,
      controls: false, // our own bar (below) replaces it
    });
  });

  it('WP13.1 Terminal: expanding sets aria-expanded, reveals the player, autoplays and scrolls into view smoothly (146611f12)', async () => {
    const h = await mount({ src: '/casts/x.cast', collapsed: true });
    await h.toggle();
    expect(h.button().getAttribute('aria-expanded')).toBe('true');
    expect(h.root.querySelector('.ocx-terminal__player')?.hasAttribute('hidden')).toBe(false);
    await vi.waitFor(() => expect(h.create).toHaveBeenCalledTimes(1));
    expect(createOpts(h)['autoPlay']).toBe(false);
    await vi.waitFor(() => expect(h.player.play).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(h.scroll).toHaveBeenCalled());
    expect(h.scroll.mock.calls.at(-1)?.[0]).toMatchObject({ block: 'nearest', behavior: 'smooth' });
  });

  it('WP13.1 Terminal: under prefers-reduced-motion expanding neither autoplays nor smooth-scrolls (DOC-EX-17)', async () => {
    const h = await mount({ src: '/casts/x.cast', collapsed: true }, { reducedMotion: true });
    await h.toggle();
    await vi.waitFor(() => expect(h.create).toHaveBeenCalledTimes(1));
    expect(createOpts(h)['autoPlay']).toBe(false);
    expect(h.player.play).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(h.scroll).toHaveBeenCalled());
    expect(h.scroll.mock.calls.at(-1)?.[0]).toMatchObject({ block: 'nearest' });
    expect(h.scroll.mock.calls.at(-1)?.[0]).not.toMatchObject({ behavior: 'smooth' });
  });

  it('WP13.1 Terminal: collapsing pauses and rewinds to 0, then re-expanding resumes without re-creating (146611f12)', async () => {
    const h = await mount({ src: '/casts/x.cast', collapsed: true });
    await h.toggle();
    await vi.waitFor(() => expect(h.create).toHaveBeenCalledTimes(1));
    await h.toggle();
    expect(h.button().getAttribute('aria-expanded')).toBe('false');
    expect(h.root.querySelector('.ocx-terminal__player')?.hasAttribute('hidden')).toBe(true);
    await vi.waitFor(() => expect(h.player.pause).toHaveBeenCalledTimes(1));
    expect(h.player.seek).toHaveBeenCalledWith(0);
    await h.toggle();
    await vi.waitFor(() => expect(h.player.play).toHaveBeenCalledTimes(2));
    expect(h.create).toHaveBeenCalledTimes(1);
    expect(h.load).toHaveBeenCalledTimes(1);
  });

  it('WP13.1 Terminal: under prefers-reduced-motion re-expanding after a collapse does not resume playback (DOC-EX-17)', async () => {
    const h = await mount({ src: '/casts/x.cast', collapsed: true }, { reducedMotion: true });
    await h.toggle();
    await vi.waitFor(() => expect(h.create).toHaveBeenCalledTimes(1));
    await h.toggle();
    await vi.waitFor(() => expect(h.player.pause).toHaveBeenCalledTimes(1));
    await h.toggle();
    await vi.waitFor(() => expect(h.scroll).toHaveBeenCalledTimes(2));
    expect(h.player.play).not.toHaveBeenCalled();
    expect(h.create).toHaveBeenCalledTimes(1);
  });

  it('WP13.1 Terminal: a failed cast fetch shows visible text in the player area, not a silent blank (WP13.1)', async () => {
    const h = await mount({ src: '/casts/missing.cast', collapsed: true }, { fetchFails: true });
    await h.toggle();
    const area = h.root.querySelector('.ocx-terminal__player');
    await vi.waitFor(() => expect(area?.textContent.trim()).not.toBe(''));
    expect(h.create).not.toHaveBeenCalled();
  });

  it('WP13.1 Terminal: a throw while creating the player also shows the visible error text (WP13.1)', async () => {
    const h = await mount({ src: '/casts/x.cast', collapsed: true }, { createThrows: true });
    await h.toggle();
    const area = h.root.querySelector('.ocx-terminal__player');
    await vi.waitFor(() => expect(area?.textContent).toBe('The recording could not be loaded.'));
  });

  it('WP13.1 Terminal: collapsing before the player resolves leaves it paused and unscrolled (WP13.1)', async () => {
    let ready = (): void => {};
    const fonts = new Promise<void>((r) => (ready = r));
    const h = await mount({ src: '/casts/x.cast', collapsed: true }, { fonts });
    await h.toggle();
    await h.toggle();
    ready();
    await vi.waitFor(() => expect(h.player.pause).toHaveBeenCalledTimes(1));
    await flush();
    expect(createOpts(h)['autoPlay']).toBe(false);
    expect(h.player.play).not.toHaveBeenCalled();
    expect(h.scroll).not.toHaveBeenCalled();
  });

  it('WP13.1 Terminal: the player is created only after document.fonts.ready, so it measures the mono font (WP13.1)', async () => {
    let ready = (): void => {};
    const fonts = new Promise<void>((r) => (ready = r));
    const h = await mount({ src: '/casts/x.cast', collapsed: true }, { fonts });
    await h.toggle();
    await flush();
    expect(h.load).toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled();
    ready();
    await vi.waitFor(() => expect(h.create).toHaveBeenCalledTimes(1));
  });

  it('WP13.1 Terminal: the cast prefetch is low priority so it does not compete with main content (WP13.1)', async () => {
    const h = await mount({ src: '/casts/x.cast' });
    expect(h.fetchMock.mock.calls[0]?.[1]).toMatchObject({ priority: 'low' });
  });

  it('WP13.1 Terminal: the default loader is shared, so a second terminal waits for the same stylesheet (WP13.1)', async () => {
    const { win } = await render({ src: '/casts/x.cast' });
    vi.stubGlobal('document', win.document);
    const a = loadDefault();
    const b = loadDefault();
    expect(b).toBe(a);
    await vi.waitFor(() => expect(win.document.querySelectorAll('link[href="/player.css"]')).toHaveLength(1));
    win.document.querySelector('link[href="/player.css"]')?.dispatchEvent(new win.Event('load'));
    await expect(a).resolves.toHaveProperty('create');
  });
});

// ── custom control bar (WP13.2, owner finding: style/replace the asciinema controls) ─────────── //

describe('WP13.2 Terminal control bar', () => {
  const controls = (h: Harness) => h.root.querySelector<HTMLElement>('.ocx-terminal__controls')!;
  const play = (h: Harness) => controls(h).querySelector<HTMLButtonElement>('.ocx-terminal__play')!;
  const seek = (h: Harness) => controls(h).querySelector<HTMLInputElement>('.ocx-terminal__seek')!;

  it('is hidden in markup and revealed once the player is created', async () => {
    const h = await mount({ src: '/casts/x.cast', collapsed: true });
    expect(controls(h).hidden).toBe(true);
    await h.toggle();
    await vi.waitFor(() => expect(controls(h).hidden).toBe(false));
  });

  it('toggles play/pause through the player API and reflects state back on the button (WP13.2)', async () => {
    const h = await mount({ src: '/casts/x.cast', collapsed: true });
    await h.toggle(); // expanding a collapsed terminal autoplays (existing behaviour): play() already called once
    await vi.waitFor(() => expect(controls(h).hidden).toBe(false));
    await vi.waitFor(() => expect(h.player.play).toHaveBeenCalledTimes(1));
    h.emit('play'); // the real player would fire this once playback actually starts
    expect(controls(h).dataset['state']).toBe('playing');
    expect(play(h).getAttribute('aria-label')).toBe('Pause');

    play(h).click();
    expect(h.player.pause).toHaveBeenCalledTimes(1);
    h.emit('pause');
    expect(controls(h).dataset['state']).toBe('paused');
    expect(play(h).getAttribute('aria-label')).toBe('Play');

    play(h).click();
    expect(h.player.play).toHaveBeenCalledTimes(2);
  });

  it('enables the seek range on metadata and commits a seek in seconds on change (WP13.2)', async () => {
    const h = await mount({ src: '/casts/x.cast', collapsed: true });
    await h.toggle();
    await vi.waitFor(() => expect(controls(h).hidden).toBe(false));

    expect(seek(h).disabled).toBe(true);
    h.emit('metadata', { duration: 20 });
    expect(seek(h).disabled).toBe(false);
    expect(controls(h).querySelector('.ocx-terminal__duration')?.textContent).toBe('0:20');

    const win = seek(h).ownerDocument.defaultView as unknown as { Event: typeof Event };
    seek(h).value = '500'; // half of the 0–1000 range
    seek(h).dispatchEvent(new win.Event('change'));
    expect(h.player.seek).toHaveBeenCalledWith(10);
  });

  // Owner 2026-09-29: the terminal jumped only on release; it must follow the thumb mid-drag.
  it('scrubs the player live on input, latest position winning over an in-flight seek', async () => {
    const h = await mount({ src: '/casts/x.cast', collapsed: true });
    await h.toggle();
    await vi.waitFor(() => expect(controls(h).hidden).toBe(false));
    h.emit('metadata', { duration: 20 });
    let release = () => {};
    h.player.seek.mockImplementationOnce(
      (): Promise<void> =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    const win = seek(h).ownerDocument.defaultView as unknown as { Event: typeof Event };
    for (const v of ['100', '200', '300']) {
      seek(h).value = v;
      seek(h).dispatchEvent(new win.Event('input'));
    }
    expect(h.player.seek.mock.calls).toEqual([[2]]); // 200 and 300 wait for the first seek
    release();
    await vi.waitFor(() => expect(h.player.seek.mock.calls).toEqual([[2], [6]])); // 200 skipped
  });

  // Review #18: a stale `seeked` from a mid-drag seek must not pull the thumb back before the final seek lands.
  it('ignores seeked (and the frame loop) while a scrub seek is in flight, then settles once', async () => {
    const h = await mount({ src: '/casts/x.cast', collapsed: true });
    await h.toggle();
    await vi.waitFor(() => expect(controls(h).hidden).toBe(false));
    h.emit('metadata', { duration: 20 });
    let release = () => {};
    h.player.seek.mockImplementationOnce(
      (): Promise<void> =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    h.player.getCurrentTime.mockResolvedValue(1); // the stale mid-drag position

    const win = seek(h).ownerDocument.defaultView as unknown as { Event: typeof Event };
    seek(h).value = '500';
    seek(h).dispatchEvent(new win.Event('input'));
    const before = h.player.getCurrentTime.mock.calls.length;
    h.emit('seeked');
    expect(h.player.getCurrentTime.mock.calls.length).toBe(before); // ignored: seek still in flight

    h.player.getCurrentTime.mockResolvedValue(10);
    release();
    await vi.waitFor(() => expect(seek(h).value).toBe('500'));
  });

  it('marks ended state on the ended event', async () => {
    const h = await mount({ src: '/casts/x.cast', collapsed: true });
    await h.toggle();
    await vi.waitFor(() => expect(controls(h).hidden).toBe(false));
    h.emit('metadata', { duration: 10 });
    h.emit('ended');
    expect(controls(h).dataset['state']).toBe('ended');
  });

  // Owner regression 2026-09-28: controls moved to the top, progress ticked once a second, and
  // never reached 100% at the end (993b460).
  it('keeps the control bar pinned to the bottom, after whatever the player inserts into the mount target', async () => {
    const h = await mount({ src: '/casts/x.cast', collapsed: true });
    await h.toggle();
    await vi.waitFor(() => expect(controls(h).hidden).toBe(false));
    const area = h.root.querySelector('.ocx-terminal__player');
    expect(area?.lastElementChild).toBe(controls(h));
  });

  it('has a fractional seek step and drives the seek bar every animation frame while playing, not once a second', async () => {
    const h = await mount({ src: '/casts/x.cast', collapsed: true });
    await h.toggle();
    await vi.waitFor(() => expect(controls(h).hidden).toBe(false));
    expect(seek(h).step).toBe('any');
    h.emit('metadata', { duration: 10 });
    h.player.getCurrentTime.mockResolvedValue(1);
    h.emit('play');
    await vi.waitFor(() => expect(h.player.getCurrentTime.mock.calls.length).toBeGreaterThan(2));
    h.emit('pause'); // stop the loop so it does not outlive this test
  });

  it('stops driving the seek bar on pause', async () => {
    const h = await mount({ src: '/casts/x.cast', collapsed: true });
    await h.toggle();
    await vi.waitFor(() => expect(controls(h).hidden).toBe(false));
    h.emit('metadata', { duration: 10 });
    h.player.getCurrentTime.mockResolvedValue(1);
    h.emit('play');
    await vi.waitFor(() => expect(h.player.getCurrentTime.mock.calls.length).toBeGreaterThan(1));
    h.emit('pause');
    const callsAtPause = h.player.getCurrentTime.mock.calls.length;
    await new Promise((r) => setTimeout(r, 20));
    expect(h.player.getCurrentTime.mock.calls.length).toBe(callsAtPause);
  });

  it('snaps to 100% and the full duration once currentTime reaches duration, even without an ended event', async () => {
    const h = await mount({ src: '/casts/x.cast', collapsed: true });
    await h.toggle();
    await vi.waitFor(() => expect(controls(h).hidden).toBe(false));
    h.emit('metadata', { duration: 10 });
    h.player.getCurrentTime.mockResolvedValue(10);
    h.emit('play');
    await vi.waitFor(() => expect(seek(h).value).toBe('1000'));
    expect(controls(h).querySelector('.ocx-terminal__current')?.textContent).toBe('0:10');
    h.emit('pause'); // only pause/ended stop the loop now
  });

  // Owner finding 2026-09-28: showTime wrote textContent + aria-valuetext every frame.
  it('writes the time readout and aria-valuetext only when the second changes, not every frame', async () => {
    const h = await mount({ src: '/casts/x.cast', collapsed: true });
    await h.toggle();
    await vi.waitFor(() => expect(controls(h).hidden).toBe(false));
    h.emit('metadata', { duration: 10 });
    const win = seek(h).ownerDocument.defaultView as unknown as { MutationObserver: typeof MutationObserver };
    const records: MutationRecord[] = [];
    const mo = new win.MutationObserver((rs) => records.push(...rs));
    mo.observe(controls(h), { subtree: true, childList: true, characterData: true, attributes: true });
    h.player.getCurrentTime.mockResolvedValue(1.2);
    h.emit('play');
    await vi.waitFor(() => expect(h.player.getCurrentTime.mock.calls.length).toBeGreaterThan(5));
    h.emit('pause');
    await flush();
    records.push(...mo.takeRecords());
    mo.disconnect();
    const current = controls(h).querySelector('.ocx-terminal__current');
    expect(records.filter((r) => r.type === 'childList' && r.target === current)).toHaveLength(1); // 0:00 → 0:01
    expect(records.filter((r) => r.attributeName === 'aria-valuetext')).toHaveLength(1);
    expect(seek(h).getAttribute('aria-valuetext')).toBe('0:01 of 0:10');
  });

  // A `loop` cast restarts at the end without emitting ended/play: a frame at t >= duration must not
  // stop the loop, or the bar freezes at 100% while the cast plays on.
  it('keeps driving the seek bar after a frame at the end on a looping player', async () => {
    const h = await mount({ src: '/casts/x.cast', collapsed: true, loop: true });
    await h.toggle();
    await vi.waitFor(() => expect(controls(h).hidden).toBe(false));
    h.emit('metadata', { duration: 10 });
    h.player.getCurrentTime.mockResolvedValue(10);
    h.emit('play');
    await vi.waitFor(() => expect(seek(h).value).toBe('1000'));
    h.player.getCurrentTime.mockResolvedValue(3); // restarted silently
    await vi.waitFor(() => expect(seek(h).value).toBe('300'));
    expect(controls(h).querySelector('.ocx-terminal__current')?.textContent).toBe('0:03');
    h.emit('pause');
  });

  it('snaps to 100% and the full duration on the ended event', async () => {
    const h = await mount({ src: '/casts/x.cast', collapsed: true });
    await h.toggle();
    await vi.waitFor(() => expect(controls(h).hidden).toBe(false));
    h.emit('metadata', { duration: 10 });
    h.emit('ended');
    expect(seek(h).value).toBe('1000');
    expect(controls(h).querySelector('.ocx-terminal__current')?.textContent).toBe('0:10');
  });
  it('captures the pointer on pointerdown and freezes the tick until pointerup', async () => {
    const h = await mount({ src: '/casts/x.cast', collapsed: true });
    await h.toggle();
    await vi.waitFor(() => expect(controls(h).hidden).toBe(false));
    h.emit('metadata', { duration: 10 });
    const s = seek(h);
    const capture = vi.fn();
    s.setPointerCapture = capture;
    const win = s.ownerDocument.defaultView as unknown as { Event: typeof Event };
    s.dispatchEvent(Object.assign(new win.Event('pointerdown'), { pointerId: 7 }));
    expect(capture).toHaveBeenCalledWith(7);
    h.player.getCurrentTime.mockResolvedValue(5);
    h.emit('play');
    await new Promise((r) => setTimeout(r, 20));
    expect(s.value).toBe('0'); // dragging: the tick must not fight the thumb
    s.dispatchEvent(new win.Event('pointerup'));
    await vi.waitFor(() => expect(s.value).toBe('500'));
    h.emit('pause');
  });
});
