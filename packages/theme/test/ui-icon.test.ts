// Iconography: the registry (src/icons/icons.mjs), ui/Icon.astro, and the `icon` on Menu and
// ActionMenu items. Rendered with the Astro Container API, parsed with JSDOM.
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ICON_NAMES, ICON_SOURCES, ICONS } from '../src/icons/icons.mjs';
import { generate, OUT } from '../scripts/generate-icons.mjs';

type Win = Window & typeof globalThis;
type Component = Parameters<AstroContainer['renderToString']>[0];
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: Win } };
// Template import: tsc has no .astro module types (as in chrome.test.ts).
const load = async (name: string) =>
  ((await import(`../src/components/ui/${name}.astro`)) as { default: Component }).default;
const Icon = await load('Icon');
const Menu = await load('Menu');
const ActionMenu = await load('ActionMenu');

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});
const render = async (c: Component, props: Record<string, unknown>) =>
  new JSDOM(`<!doctype html><body>${await container.renderToString(c, { props })}</body>`).window.document;

describe('icon registry', () => {
  it('covers the interface, action, OS and shell icons the theme draws', () => {
    for (const name of ['chevron-down', 'chevron-right', 'arrow-right', 'close', 'check', 'search', 'copy'])
      expect(ICON_NAMES).toContain(name);
    for (const name of ['linux', 'apple', 'windows', 'shell', 'powershell', 'nushell', 'fish', 'elvish', 'cmd'])
      expect(ICON_NAMES).toContain(name);
  });

  it.each(ICON_NAMES)('%s: a viewBox, parseable SVG children, at most 2 KB inline', (name) => {
    const icon = ICONS[name];
    expect(icon.viewBox).toMatch(/^0 0 \d+ \d+$/);
    expect(icon.body.length).toBeLessThanOrEqual(2048);
    const doc = new JSDOM('').window.document;
    const parsed = new doc.defaultView!.DOMParser().parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg">${icon.body}</svg>`,
      'image/svg+xml',
    );
    expect(parsed.querySelector('parsererror')).toBeNull();
    expect(parsed.documentElement.children.length).toBeGreaterThan(0);
    expect(icon.body).not.toMatch(/<script|\son\w+=/i);
  });

  it('every icon names its source set', () => {
    expect(Object.keys(ICON_SOURCES)).toEqual(ICON_NAMES);
    for (const name of ICON_NAMES) expect(['lucide', 'simple-icons', 'custom']).toContain(ICON_SOURCES[name]);
  });

  it('no icon carries a colour of its own: every body paints in currentColor', () => {
    for (const name of ICON_NAMES)
      expect(ICONS[name].body, name).not.toMatch(
        /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|url\(|(fill|stroke)="(?!none"|currentColor")/i,
      );
  });

  it('icons.generated.mjs, icons.sources.generated.mjs and icons.d.ts are what the generator writes (run `pnpm --filter @ocx-sh/theme icons`)', () => {
    const out = generate();
    expect(readFileSync(OUT.mjs, 'utf8')).toBe(out.mjs);
    expect(readFileSync(OUT.sources, 'utf8')).toBe(out.sources);
    expect(readFileSync(OUT.dts, 'utf8')).toBe(out.dts);
  });

  it('line icons draw at the --ocx-icon-stroke weight at every size (non-scaling stroke)', () => {
    const css = readFileSync(new URL('../src/components/ui/Icon.astro', import.meta.url), 'utf8');
    expect(css).toMatch(/:where\(\.ocx-icon\[stroke\]\) \{\s*stroke-width: var\(--ocx-icon-stroke\);/);
    expect(css).toMatch(/:where\(\.ocx-icon\[stroke\] \*\) \{\s*vector-effect: non-scaling-stroke;/);
    const tokens = readFileSync(new URL('../src/tokens.css', import.meta.url), 'utf8');
    expect(tokens).toMatch(/--ocx-icon-stroke: [\d.]+px;/);
  });
});

describe('Icon', () => {
  it('decorative by default: aria-hidden, not focusable, sized md', async () => {
    const svg = (await render(Icon, { name: 'arrow-right' })).querySelector('svg');
    expect(svg?.getAttribute('class')).toContain('ocx-icon');
    expect(svg?.getAttribute('data-icon')).toBe('arrow-right');
    expect(svg?.getAttribute('data-size')).toBe('md');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('focusable')).toBe('false');
    expect(svg?.hasAttribute('role')).toBe(false);
    expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg?.querySelector('path')?.getAttribute('d')).toBe('M5 12h14m-7-7l7 7l-7 7');
  });

  it('line icons stroke in currentColor with round joins; filled icons fill in currentColor', async () => {
    const line = (await render(Icon, { name: 'check' })).querySelector('svg');
    expect(line?.getAttribute('fill')).toBe('none');
    expect(line?.getAttribute('stroke')).toBe('currentColor');
    expect(line?.getAttribute('stroke-width')).toBe('2');
    expect(line?.getAttribute('stroke-linecap')).toBe('round');
    const fill = (await render(Icon, { name: 'linux' })).querySelector('svg');
    expect(fill?.getAttribute('fill')).toBe('currentColor');
    expect(fill?.hasAttribute('stroke')).toBe(false);
  });

  it('a label makes it a named image', async () => {
    const svg = (await render(Icon, { name: 'windows', label: 'Windows', size: 'lg' })).querySelector('svg');
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBe('Windows');
    expect(svg?.hasAttribute('aria-hidden')).toBe(false);
    expect(svg?.getAttribute('data-size')).toBe('lg');
  });

  it('an unknown name fails the build instead of rendering nothing', async () => {
    await expect(container.renderToString(Icon, { props: { name: 'nope' } })).rejects.toThrow(/no icon named "nope"/);
  });
});

describe('icons on menu items', () => {
  const links = [
    { label: 'Docs', href: '/docs/', icon: 'external' },
    { label: 'Apps', href: '/apps/' },
  ];

  it('Menu: the trigger chevron and the row arrow are registry icons; an item icon leads its label', async () => {
    const doc = await render(Menu, { label: 'Sections', items: links });
    expect(doc.querySelector('.ocx-ui-menu__trigger [data-icon="chevron-down"]')).not.toBeNull();
    const [docs, apps] = [...doc.querySelectorAll('.ocx-ui-menu__item')];
    expect(docs?.firstElementChild?.getAttribute('data-icon')).toBe('external');
    expect(docs?.querySelector('.ocx-ui-menu__arrow')?.getAttribute('data-icon')).toBe('arrow-right');
    // An item without an icon keeps the slot, so labels align.
    expect(apps?.firstElementChild?.matches('span.ocx-ui-menu__icon[aria-hidden="true"]')).toBe(true);
    expect(docs?.textContent.trim()).toBe('Docs');
  });

  it('Menu: no item icon, no slot', async () => {
    const doc = await render(Menu, { label: 'Sections', items: [{ label: 'Apps', href: '/apps/' }] });
    expect(doc.querySelector('.ocx-ui-menu__icon')).toBeNull();
  });

  it('ActionMenu: item icons lead the label, other items keep the slot; the item name stays the label', async () => {
    const doc = await render(ActionMenu, {
      label: 'Actions',
      items: [
        { value: 'copy', label: 'Copy digest', icon: 'copy' },
        { value: 'pin', label: 'Pin version' },
      ],
    });
    const [copy, pin] = [...doc.querySelectorAll('[data-part="item"]')];
    expect(copy?.querySelector('svg.ocx-ui-action-menu__icon')?.getAttribute('data-icon')).toBe('copy');
    expect(copy?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(pin?.querySelector('span.ocx-ui-action-menu__icon')).not.toBeNull();
    expect(copy?.textContent.trim()).toBe('Copy digest');
    expect(doc.querySelector('.ocx-ui-button [data-icon="chevron-down"]')).not.toBeNull();
  });
});
