// <LogoTile> (Container API, node env): the server-rendered markup and the styles. The behaviour of
// the script (fade state, the fallback chain, a logo that failed before the script ran) is in
// components-logo-tile.dom.test.ts. Parity ids are the catalog 0.5.3 -> 0.6 defect ledger rows.
import { readFileSync } from 'node:fs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';
import { monogramHue, monogramInitials } from '../src/components/ui/logo-tile.mjs';

type Component = Parameters<AstroContainer['renderToString']>[0];
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: Window } };
// Template import: tsc has no .astro module types (as in components-avatar.test.ts).
const LogoTile = ((await import(`../src/components/ui/${'LogoTile'}.astro`)) as { default: Component }).default;

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});
const html = (props: Record<string, unknown>) => container.renderToString(LogoTile, { props });
const render = async (props: Record<string, unknown>) => new JSDOM(await html(props)).window.document;
const tile = async (props: Record<string, unknown>) => {
  const d = await render(props);
  return {
    d,
    root: d.querySelector('.ocx-logo-tile')!,
    img: d.querySelector('img'),
    face: d.querySelector('.ocx-logo-tile__initials')!,
  };
};

const styles = readFileSync(new URL('../src/components/ui/LogoTile.astro', import.meta.url), 'utf8');
const css = /<style>([\s\S]*)<\/style>/.exec(styles)?.[1] ?? '';
const tokens = readFileSync(new URL('../src/tokens.css', import.meta.url), 'utf8');
const rule = (selector: string) => {
  const at = css.indexOf(`${selector} {`);
  return css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
};

describe('LogoTile SSR', () => {
  it('D-009 the initials are server-rendered under the logo, which carries no inline handler', async () => {
    const markup = await html({ name: 'cmake', src: '/p/cmake/logo.svg' });
    const { root, img, face } = await tile({ name: 'cmake', src: '/p/cmake/logo.svg' });
    expect([...root.children].map((c) => c.tagName + '.' + c.classList[0])).toEqual([
      'SPAN.ocx-logo-tile__initials',
      'IMG.ocx-logo-tile__image',
    ]);
    expect(face.textContent).toBe('CM');
    expect(img?.getAttribute('src')).toBe('/p/cmake/logo.svg');
    expect(img?.hasAttribute('hidden')).toBe(false);
    expect(markup).not.toMatch(/\son(error|load)=/i);
    expect(root.getAttribute('aria-hidden')).toBe('true');
  });

  it('D-009 without a logo the image stays in the markup, hidden and empty, for a clone to fill', async () => {
    const { img, root } = await tile({ name: 'cmake' });
    expect(img?.hasAttribute('hidden')).toBe(true);
    expect(img?.hasAttribute('src')).toBe(false);
    expect(root.getAttribute('data-state')).toBe('fallback');
  });

  it('D-011 the hue is the djb2 hash of the seed, four hues, defaulting to the name', async () => {
    // The pins the 0.5.3 UI shipped: a change here recolours every existing package.
    expect(monogramHue('kitware/cmake')).toBe(0);
    expect(monogramHue('ocx-contrib/shellcheck')).toBe(2);
    for (const key of ['', 'a', 'x'.repeat(200)]) expect([0, 1, 2, 3]).toContain(monogramHue(key));
    expect((await tile({ name: 'x', seed: 'kitware/cmake' })).root.getAttribute('data-hue')).toBe('0');
    expect((await tile({ name: 'x', seed: 'ocx-contrib/shellcheck' })).root.getAttribute('data-hue')).toBe('2');
    expect((await tile({ name: 'cli' })).root.getAttribute('data-hue')).toBe(String(monogramHue('cli')));
  });

  it('D-011 monogram initials: first two characters, or the first of the first two segments', () => {
    expect(monogramInitials('cmake')).toBe('CM');
    expect(monogramInitials('shellcheck')).toBe('SH');
    expect(monogramInitials('foo-bar')).toBe('FB');
    expect(monogramInitials('a_b_c')).toBe('AB');
    expect(monogramInitials('foo.bar')).toBe('FB');
    expect(monogramInitials('')).toBe('');
  });

  it('D-011 D-161 each hue paints the initials from its own overridable --ocx-color-monogram-* pair', () => {
    for (const hue of [1, 2, 3]) {
      const body = rule(`.ocx-logo-tile[data-hue='${hue}']`);
      expect(body).toContain(`--_ink: var(--ocx-color-monogram-${hue})`);
      expect(body).toContain(`--_tint: var(--ocx-color-monogram-${hue}-tint)`);
    }
    expect(rule('.ocx-logo-tile')).toContain('var(--ocx-color-monogram-0)');
    expect(rule('.ocx-logo-tile__initials')).toMatch(/background: var\(--_tint\)[\s\S]*color: var\(--_ink\)/);
  });

  it('D-035 the logo is lazy and decoded off-thread, and the box is reserved at its px size', async () => {
    for (const [size, px] of [
      ['sm', '20'],
      ['md', '30'],
      ['lg', '38'],
      ['xl', '56'],
    ] as const) {
      const { img } = await tile({ name: 'cmake', src: '/l.svg', size });
      expect(img?.getAttribute('loading')).toBe('lazy');
      expect(img?.getAttribute('decoding')).toBe('async');
      expect(img?.getAttribute('alt')).toBe('');
      expect([img?.getAttribute('width'), img?.getAttribute('height')]).toEqual([px, px]);
    }
    expect(rule('.ocx-logo-tile')).toMatch(/inline-size: var\(--_size\);\s*block-size: var\(--_size\)/);
  });

  it('D-035 the logo starts transparent and fades in on the duration token; the monogram fades out', () => {
    expect(rule('.ocx-logo-tile__image')).toMatch(/opacity: 0;\s*transition: opacity var\(--ocx-duration-moderate\)/);
    expect(rule(".ocx-logo-tile[data-state='ready'] .ocx-logo-tile__image")).toContain('opacity: 1');
    expect(rule(".ocx-logo-tile[data-state='ready'] .ocx-logo-tile__initials")).toContain('opacity: 0');
    expect(rule('.ocx-logo-tile__initials,\n    .ocx-logo-tile__cube')).toContain(
      'transition: opacity var(--ocx-duration-moderate)',
    );
  });

  it('D-035 reduced motion is the duration tokens at 0s, and without script the logo shows over the monogram', () => {
    expect(tokens).toMatch(/prefers-reduced-motion: reduce\)[\s\S]*--ocx-duration-moderate: 0s/);
    expect(css.match(/transition:[^;]*/g)?.every((t) => t.includes('var(--ocx-duration-moderate)'))).toBe(true);
    expect(css).toMatch(/@media \(scripting: none\) \{\s*\.ocx-logo-tile__image \{\s*opacity: 1/);
  });

  it('D-037 the logo is bare: no background, border or radius on the image, and nothing behind it once ready', () => {
    const img = rule('.ocx-logo-tile__image');
    expect(img).not.toMatch(/background|border|radius|padding/);
    expect(img).toContain('object-fit: contain');
    // The monogram keeps its tile look (it IS a box), but is gone when the logo shows.
    expect(rule('.ocx-logo-tile__initials,\n    .ocx-logo-tile__cube')).toContain(
      'border-radius: var(--ocx-radius-lg)',
    );
    expect(rule('.ocx-logo-tile')).not.toMatch(/background|border/);
  });

  it('D-038 no logo and no initials renders the box icon in a tile instead of an empty square', async () => {
    const { d, root } = await tile({});
    expect(root.getAttribute('data-state')).toBe('empty');
    expect(d.querySelector('.ocx-logo-tile__cube svg')?.getAttribute('data-icon')).toBe('box');
    expect(rule(".ocx-logo-tile[data-state='empty'] .ocx-logo-tile__initials")).toContain('display: none');
    expect(rule(".ocx-logo-tile[data-state='empty'] .ocx-logo-tile__cube")).toContain('display: flex');
    // Only that case carries the cube: a normal tile does not pay for it.
    expect((await render({ name: 'cmake' })).querySelector('.ocx-logo-tile__cube')).toBeNull();
    expect((await render({ src: '/l.svg' })).querySelector('.ocx-logo-tile__cube')).toBeNull();
  });

  it('D-038 the cube comes from the icon registry, never a drawn path', () => {
    expect(styles).toContain('<Icon name="box" />');
    expect(styles).not.toMatch(/<path|<polyline|<line /);
  });

  it('styles are @layer ocx and tokens only', () => {
    expect(css.trim()).toMatch(/^@layer ocx \{[\s\S]*\}$/);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(/i);
    expect(styles).not.toContain('@zag-js');
  });
});

describe('D-011 D-161 monogram tokens', () => {
  const lines = tokens.split('\n');
  const section = (open: string) => {
    const from = lines.findIndex((l, i) => l === open && /monogram/.test(lines[i + 1] ?? ''));
    const body = lines.slice(from + 1, lines.indexOf('}', from));
    return new Map(
      body.flatMap((l) => (/^\s*(--[\w-]+):\s*([^;]+);/.exec(l) ? [[RegExp.$1, RegExp.$2] as const] : [])),
    );
  };
  const light = section(":root[data-theme='light'] {");
  const dark = section(":root[data-theme='dark'] {");
  const LIGHT: [string, string][] = [
    ['#c53a24', 'rgba(255, 96, 71, 0.1)'],
    ['#0a7652', 'rgba(14, 159, 110, 0.1)'],
    ['#5f49c4', 'rgba(111, 91, 208, 0.1)'],
    ['#8f610f', 'rgba(250, 184, 51, 0.16)'],
  ];
  const DARK: [string, string][] = [
    ['#ff8570', 'rgba(255, 96, 71, 0.14)'],
    ['#3edea6', 'rgba(62, 222, 166, 0.12)'],
    ['#c0b3ff', 'rgba(192, 179, 255, 0.12)'],
    ['#fab833', 'rgba(250, 184, 51, 0.12)'],
  ];

  it.each([0, 1, 2, 3])('hue %i keeps its ink and tint in both schemes (light hue 2 ink darkened for 4.5:1)', (i) => {
    expect(light.get(`--ocx-color-monogram-${i}`)).toBe(LIGHT[i]![0]);
    expect(light.get(`--ocx-color-monogram-${i}-tint`)).toBe(LIGHT[i]![1]);
    expect(dark.get(`--ocx-color-monogram-${i}`)).toBe(DARK[i]![0]);
    expect(dark.get(`--ocx-color-monogram-${i}-tint`)).toBe(DARK[i]![1]);
  });

  it('the dark block is also the VitePress/catalog `.dark` class, so one override rebrands both', () => {
    expect(tokens).toMatch(/\.dark,\s*:root\[data-theme='dark'\] \{\s*--ocx-color-monogram-0:/);
  });
  it('every ink clears 4.5:1 on its own tint over the surface it is read on', () => {
    const surfaces = [...tokens.matchAll(/--ocx-color-surface:\s*(#[0-9a-f]{6});/g)].map((m) => m[1]!);
    const channel = (hex: string, i: number) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
    const lum = ([r, g, b]: number[]) =>
      [r, g, b]
        .map((v) => (v! / 255 <= 0.03928 ? v! / 255 / 12.92 : ((v! / 255 + 0.055) / 1.055) ** 2.4))
        .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i]!, 0);
    for (const [scheme, inks, surface] of [
      ['light', LIGHT, surfaces[0]!],
      ['dark', DARK, surfaces[1]!],
    ] as const) {
      for (const [ink, tint] of inks) {
        const [r, g, b, a] = /rgba\((\d+), (\d+), (\d+), ([\d.]+)\)/.exec(tint)!.slice(1).map(Number) as [
          number,
          number,
          number,
          number,
        ];
        const bg = [r, g, b].map((v, i) => v * a + channel(surface, i) * (1 - a));
        const [hi, lo] = [lum(bg), lum([0, 1, 2].map((i) => channel(ink, i)))].sort((x, y) => y - x) as [
          number,
          number,
        ];
        expect((hi + 0.05) / (lo + 0.05), `${scheme} ${ink}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe('LogoTile size tokens', () => {
  const tokens = readFileSync(new URL('../src/tokens.css', import.meta.url), 'utf8');
  const source = readFileSync(new URL('../src/components/ui/LogoTile.astro', import.meta.url), 'utf8');
  const px = (name: string) => Number(new RegExp(`${name}:\\s*(\\d+)px`).exec(tokens)?.[1]);

  it('the image px map matches the box tokens each size resolves to', () => {
    const map = /\{ sm: (\d+), md: (\d+), lg: (\d+), xl: (\d+) \}/.exec(source)!.slice(1).map(Number);
    expect(map).toEqual([
      px('--ocx-control-sm'),
      px('--ocx-control-lg'),
      px('--ocx-control-2xl'),
      px('--ocx-space-8') + px('--ocx-space-5'),
    ]);
  });

  it('the styles size each box with exactly those tokens', () => {
    expect(source).toContain('--_size: var(--ocx-control-lg);');
    expect(source).toContain("[data-size='sm'] {\n      --_size: var(--ocx-control-sm);");
    expect(source).toContain("[data-size='lg'] {\n      --_size: var(--ocx-control-2xl);");
    expect(source).toContain('--_size: calc(var(--ocx-space-8) + var(--ocx-space-5));');
  });
});

describe('LogoTile fallback', () => {
  it('writes data-fallback on the image only when a src is given', async () => {
    expect((await tile({ name: 'cmake', src: '/a.svg', fallback: '/a.png' })).img!.getAttribute('data-fallback')).toBe(
      '/a.png',
    );
    expect((await tile({ name: 'cmake', src: '/a.svg' })).img!.hasAttribute('data-fallback')).toBe(false);
    expect((await tile({ name: 'cmake', fallback: '/a.png' })).img!.hasAttribute('data-fallback')).toBe(false);
  });
});
