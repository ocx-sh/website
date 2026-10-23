// @vitest-environment jsdom
// LogoTile script: two capture listeners on `document` see every logo image (server-rendered or
// cloned in later); `install()` settles images that finished before it ran; `fillLogoTile` refills a
// cloned tile. Parity ids are the catalog 0.5.3 -> 0.6 defect ledger rows.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { fillLogoTile, install, monogramHue } from '../src/components/ui/logo-tile.mjs';

const tileHtml = (src: string | null, state = src ? 'loading' : 'fallback') =>
  `<span class="ocx-logo-tile" data-state="${state}" data-hue="0"><span class="ocx-logo-tile__initials">CM</span>` +
  `<img class="ocx-logo-tile__image" alt=""${src ? ` src="${src}"` : ' hidden'}></span>`;

const place = (src: string | null, state?: string) => {
  document.body.innerHTML = tileHtml(src, state);
  return {
    tile: document.querySelector<HTMLElement>('.ocx-logo-tile')!,
    img: document.querySelector<HTMLImageElement>('img')!,
  };
};
/** The pixels a browser reports for a finished image. */
const finished = (img: HTMLImageElement, naturalWidth: number) => {
  Object.defineProperty(img, 'complete', { value: true, configurable: true });
  Object.defineProperty(img, 'naturalWidth', { value: naturalWidth, configurable: true });
};

beforeAll(() => install());
afterEach(() => {
  document.body.innerHTML = '';
});

describe('LogoTile script', () => {
  it('D-035 a loaded logo flips the tile to ready, which is what fades it in over the initials', () => {
    const { tile, img } = place('/l.png');
    expect(tile.dataset['state']).toBe('loading');
    img.dispatchEvent(new Event('load'));
    expect(tile.dataset['state']).toBe('ready');
    expect(img.hidden).toBe(false);
  });

  it('D-009 a logo that fails is hidden and the tile falls back to the initials', () => {
    const { tile, img } = place('/l.png');
    img.dispatchEvent(new Event('error'));
    expect(img.hidden).toBe(true);
    expect(tile.dataset['state']).toBe('fallback');
    expect(tile.querySelector('.ocx-logo-tile__initials')?.textContent).toBe('CM');
  });

  it('D-009 a logo that already failed before the script ran is settled by install()', () => {
    const { tile, img } = place('/l.png');
    finished(img, 0);
    install();
    expect(img.hidden).toBe(true);
    expect(tile.dataset['state']).toBe('fallback');
  });

  it('D-009 a logo that already loaded before the script ran is ready, not left transparent', () => {
    const { tile, img } = place('/l.png');
    finished(img, 24);
    install();
    expect(tile.dataset['state']).toBe('ready');
  });

  it('D-009 install() leaves a still-loading logo and a tile with no logo alone', () => {
    const loading = place('/l.png');
    Object.defineProperty(loading.img, 'complete', { value: false, configurable: true });
    install();
    expect(loading.tile.dataset['state']).toBe('loading');
    const none = place(null);
    install();
    expect(none.tile.dataset['state']).toBe('fallback');
  });

  it('D-009 a logo cloned in after the script ran is covered too (no per-image listener)', () => {
    const clone = document.createElement('div');
    clone.innerHTML = tileHtml('/new.png');
    document.body.append(clone);
    clone.querySelector('img')!.dispatchEvent(new Event('error'));
    expect(clone.querySelector<HTMLElement>('.ocx-logo-tile')?.dataset['state']).toBe('fallback');
  });

  it('D-009 other images and bare images outside a tile are ignored', () => {
    document.body.innerHTML = `<img id="x" src="/x.png"><img class="ocx-logo-tile__image" src="/y.png">`;
    document.getElementById('x')!.dispatchEvent(new Event('error'));
    document.querySelector('.ocx-logo-tile__image')!.dispatchEvent(new Event('error'));
    expect(document.getElementById('x')!.hidden).toBe(false);
  });

  it('the data-fallback src is tried once; the second failure falls back to the monogram', () => {
    const { tile, img } = place('/p/cmake/logo.svg');
    img.dataset['fallback'] = '/p/cmake/logo.png';
    img.dispatchEvent(new Event('error'));
    expect(img.getAttribute('src')).toBe('/p/cmake/logo.png');
    expect(img.hidden).toBe(false);
    expect(tile.dataset['state']).toBe('loading');
    img.dispatchEvent(new Event('error'));
    expect(img.getAttribute('src')).toBe('/p/cmake/logo.png');
    expect(img.hidden).toBe(true);
    expect(tile.dataset['state']).toBe('fallback');
  });

  it('the fallback that loads makes the tile ready', () => {
    const { tile, img } = place('/p/cmake/logo.svg');
    img.dataset['fallback'] = '/p/cmake/logo.png';
    img.dispatchEvent(new Event('error'));
    img.dispatchEvent(new Event('load'));
    expect(tile.dataset['state']).toBe('ready');
  });

  it('a failed .svg with no data-fallback is not guessed at', () => {
    const { tile, img } = place('/p/cmake/logo.svg');
    img.dispatchEvent(new Event('error'));
    expect(img.hidden).toBe(true);
    expect(img.getAttribute('src')).toBe('/p/cmake/logo.svg');
    expect(tile.dataset['state']).toBe('fallback');
  });

  it('a fallback also serves a logo that failed before the script ran', () => {
    const { img } = place('/p/cmake/logo.svg');
    img.dataset['fallback'] = '/p/cmake/logo.png';
    finished(img, 0);
    install();
    expect(img.getAttribute('src')).toBe('/p/cmake/logo.png');
  });
});

describe('fillLogoTile', () => {
  it('sets data-fallback from the fill and clears a stale one', () => {
    const { tile } = place(null);
    fillLogoTile(tile, { name: 'uv', src: '/a.svg', fallback: '/a.png' });
    const img = tile.querySelector('img')!;
    expect(img.getAttribute('data-fallback')).toBe('/a.png');
    fillLogoTile(tile, { name: 'uv', src: '/b.svg' });
    expect(img.hasAttribute('data-fallback')).toBe(false);
  });

  it('D-009 D-011 a tile with a logo gets the initials, the hue of its seed and the logo, loading', () => {
    const { tile, img } = place(null, 'empty');
    fillLogoTile(tile, { name: 'cmake-tools', seed: 'kitware/cmake', src: '/p/cmake/logo.svg' });
    expect(tile.querySelector('.ocx-logo-tile__initials')?.textContent).toBe('CT');
    expect(tile.dataset['hue']).toBe('0');
    expect(img.getAttribute('src')).toBe('/p/cmake/logo.svg');
    expect(img.hidden).toBe(false);
    expect(tile.dataset['state']).toBe('loading');
  });

  it('D-011 the seed defaults to the name', () => {
    const { tile } = place(null);
    fillLogoTile(tile, { name: 'a' });
    expect(tile.dataset['hue']).toBe('2');
  });

  it('D-009 D-036 a recycled tile starts clean: a failure and a spent fallback retry do not carry over', () => {
    const { tile, img } = place('/old/logo.svg');
    img.dataset['fallback'] = '/old/logo.png';
    img.dispatchEvent(new Event('error'));
    img.dispatchEvent(new Event('error'));
    expect(tile.dataset['state']).toBe('fallback');
    fillLogoTile(tile, { name: 'uv', src: '/new/logo.svg', fallback: '/new/logo.png' });
    expect(tile.dataset['state']).toBe('loading');
    expect(img.hidden).toBe(false);
    img.dispatchEvent(new Event('error'));
    expect(img.getAttribute('src')).toBe('/new/logo.png');
  });

  it('D-009 a package without a logo shows its initials and no image', () => {
    const { tile, img } = place('/old/logo.png');
    fillLogoTile(tile, { name: 'uv' });
    expect(img.hasAttribute('src')).toBe(false);
    expect(img.hidden).toBe(true);
    expect(tile.dataset['state']).toBe('fallback');
  });

  it('D-038 neither logo nor initials is the empty state (the cube)', () => {
    const { tile } = place('/old/logo.png');
    fillLogoTile(tile, { name: '' });
    expect(tile.dataset['state']).toBe('empty');
  });

  it('a tile without the monogram or image parts still takes the hue and state', () => {
    document.body.innerHTML = '<span class="ocx-logo-tile"></span>';
    const tile = document.querySelector<HTMLElement>('.ocx-logo-tile')!;
    fillLogoTile(tile, { name: 'uv' });
    expect([tile.dataset['hue'], tile.dataset['state']]).toEqual([String(monogramHue('uv')), 'fallback']);
  });
});
