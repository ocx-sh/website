// WP13.4 PlatformIcons: port of ocx PlatformIcons.vue (9d81ae9f8, 364cdafa5).
// Rendered with the Astro Container API, parsed with JSDOM.
import { readFileSync } from 'node:fs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';

type Win = Window & typeof globalThis;
type Component = Parameters<AstroContainer['renderToString']>[0];
// Template import: tsc has no .astro module types (as in chrome.test.ts).
const PlatformIcons = ((await import(`../src/components/${'PlatformIcons'}.astro`)) as { default: Component }).default;
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: Win } };

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});

async function render(props: {
  platforms: string[];
  mode?: 'os' | 'os-arch';
}): Promise<{ html: string; doc: Document }> {
  const html = await container.renderToString(PlatformIcons, { props });
  return { html, doc: new JSDOM(html).window.document };
}

const groups = (doc: Document) => [...doc.querySelectorAll('.ocx-platform')];

describe('WP13.4 PlatformIcons', () => {
  it.each([
    ['linux', 'Linux', 'path'],
    ['darwin', 'macOS', 'path'],
    ['windows', 'Windows', 'path'],
  ])(
    'WP13.4 PlatformIcons: %s renders an inline SVG glyph filled with currentColor, named %j (9d81ae9f8)',
    async (os, label, shape) => {
      const { doc } = await render({ platforms: [os] });
      const group = doc.querySelector(`.ocx-platform[data-os="${os}"]`);
      expect(group?.getAttribute('role')).toBe('img');
      expect(group?.getAttribute('aria-label')).toBe(label);
      expect(group?.getAttribute('title')).toBe(label);
      const svg = group?.querySelector('svg');
      expect(svg?.getAttribute('aria-hidden')).toBe('true');
      expect(svg?.getAttribute('focusable')).toBe('false');
      expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24');
      const shapes = [...(svg?.querySelectorAll('path, rect') ?? [])];
      expect(shapes.length).toBeGreaterThan(0);
      expect(svg?.querySelector(shape)).not.toBeNull();
      expect(svg?.getAttribute('fill')).toBe('currentColor');
      for (const s of shapes) expect(s.getAttribute('fill') ?? 'currentColor').toBe('currentColor');
      expect(svg?.getAttribute('data-icon'), 'drawn by the registry Icon').toBeTruthy();
    },
  );

  it('WP13.4 PlatformIcons: windows is the four-pane glyph (Simple Icons: one path, four panes) (9d81ae9f8)', async () => {
    const { doc } = await render({ platforms: ['windows'] });
    const d = doc.querySelector('.ocx-platform[data-os="windows"] svg path')?.getAttribute('d') ?? '';
    expect(d.match(/[Mm]/g)).toHaveLength(4); // one moveto per pane
  });

  it('WP13.4 PlatformIcons: known OSes sort linux, darwin, windows, any, then unknown alphabetically (9d81ae9f8)', async () => {
    const { doc } = await render({ platforms: ['windows', 'zos', 'any', 'darwin', 'freebsd', 'linux'] });
    expect(groups(doc).map((g) => g.getAttribute('data-os'))).toEqual([
      'linux',
      'darwin',
      'windows',
      'any',
      'freebsd',
      'zos',
    ]);
  });

  it('WP13.4 PlatformIcons: os/arch entries group by OS; title lists sorted, de-duplicated arches (9d81ae9f8)', async () => {
    const { doc } = await render({ platforms: ['linux/arm64', 'linux/amd64', 'linux/arm64', 'darwin/arm64'] });
    expect(groups(doc)).toHaveLength(2);
    const linux = doc.querySelector('.ocx-platform[data-os="linux"]');
    expect(linux?.getAttribute('title')).toBe('Linux (amd64, arm64)');
    expect(linux?.getAttribute('aria-label')).toBe('Linux (amd64, arm64)');
  });

  it('WP13.4 PlatformIcons: an unknown OS falls back to its name as text, still an accessible img (9d81ae9f8)', async () => {
    const { doc } = await render({ platforms: ['freebsd/amd64'] });
    const group = doc.querySelector('.ocx-platform[data-os="freebsd"]');
    expect(group?.querySelector('svg')).toBeNull();
    expect(group?.querySelector('.ocx-platform__fallback')?.textContent.trim()).toBe('freebsd');
    expect(group?.getAttribute('role')).toBe('img');
    expect(group?.getAttribute('aria-label')).toBe('freebsd (amd64)');
    expect(group?.getAttribute('title')).toBe('freebsd (amd64)');
  });

  it('WP13.4 PlatformIcons: empty and malformed entries render nothing (9d81ae9f8)', async () => {
    expect((await render({ platforms: [] })).doc.querySelector('.ocx-platforms')).toBeNull();
    expect((await render({ platforms: ['', '/amd64'] })).doc.querySelector('.ocx-platforms')).toBeNull();
  });

  it('WP13.4 PlatformIcons: mode defaults to "os" — glyphs only, no name or arch chips (9d81ae9f8)', async () => {
    const { doc } = await render({ platforms: ['linux/amd64'] });
    expect(doc.querySelector('.ocx-platforms')?.getAttribute('data-mode')).toBe('os');
    expect(doc.querySelector('.ocx-platform__name, .ocx-platform__arch')).toBeNull();
  });

  it('WP13.4 PlatformIcons: mode="os-arch" adds the OS name and one chip per sorted arch (9d81ae9f8)', async () => {
    const { doc } = await render({ mode: 'os-arch', platforms: ['linux/arm64', 'linux/amd64', 'darwin/arm64'] });
    expect(doc.querySelector('.ocx-platforms')?.getAttribute('data-mode')).toBe('os-arch');
    const linux = doc.querySelector('.ocx-platform[data-os="linux"]');
    expect(linux?.querySelector('.ocx-platform__name')?.textContent.trim()).toBe('Linux');
    expect([...(linux?.querySelectorAll('.ocx-platform__arch') ?? [])].map((a) => a.textContent.trim())).toEqual([
      'amd64',
      'arm64',
    ]);
  });

  it('WP13.4 PlatformIcons: ships zero client JS (no <script> in the output)', async () => {
    const { html } = await render({ platforms: ['linux', 'darwin', 'windows'] });
    expect(html).not.toMatch(/<script/i);
  });

  it('WP13.4 PlatformIcons: styles sit in @layer ocx and the fade-in is gated on prefers-reduced-motion: no-preference', () => {
    const src = readFileSync(new URL('../src/components/PlatformIcons.astro', import.meta.url), 'utf8');
    const style = /<style[^>]*>([\s\S]*)<\/style>/.exec(src)?.[1] ?? '';
    expect(style).toMatch(/@layer ocx\s*\{/);
    expect(style).toMatch(/@media \(prefers-reduced-motion: no-preference\)[\s\S]*animation/);
    expect(style).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
  });

  it('WP14c PlatformIcons: arch chips and the unknown-OS fallback are the Tag primitive (label, neutral)', async () => {
    const { doc } = await render({ mode: 'os-arch', platforms: ['linux/amd64', 'freebsd/amd64'] });
    const chips = [...doc.querySelectorAll('.ocx-platform__arch, .ocx-platform__fallback')];
    expect(chips.length).toBe(3);
    for (const c of chips) {
      expect(c.classList.contains('ocx-ui-tag')).toBe(true);
      expect(c.getAttribute('data-variant')).toBe('label');
      expect(c.getAttribute('data-tone')).toBe('neutral');
    }
    const src = readFileSync(new URL('../src/components/PlatformIcons.astro', import.meta.url), 'utf8');
    expect(src, 'bespoke chip CSS deleted').not.toMatch(/\.ocx-platform__(arch|fallback)\s*[,{]/);
  });
});
