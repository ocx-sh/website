// <Logo> (C-300, D-R1…D-R3): the logo.svg inlined byte for byte plus the box attributes, a link or a
// span, the accessible name rules, and no client JS. Box, axe and the Header brand: components-logo.spec.ts.
import { readFileSync } from 'node:fs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';

type Component = Parameters<AstroContainer['renderToString']>[0];
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: Window } };
// Template import: tsc has no .astro module types (as in chrome.test.ts).
const Logo = ((await import(`../src/components/ui/${'Logo'}.astro`)) as { default: Component }).default;
const src = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const LOGO = src('../src/logo.svg');
const SOURCE = src('../src/components/ui/Logo.astro');
const TOKENS = src('../src/tokens.css');

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});
const html = (props: Record<string, unknown> = {}) => container.renderToString(Logo, { props });
const render = async (props: Record<string, unknown> = {}) =>
  new JSDOM(`<!doctype html><body>${await html(props)}</body>`).window.document;
const root = async (props: Record<string, unknown> = {}) => (await render(props)).querySelector('.ocx-logo');
const px = (token: string) => Number(new RegExp(`${token}: (\\d+)px;`).exec(TOKENS)?.[1]);

describe('Logo', () => {
  it('D-R1: the svg is logo.svg byte for byte, apart from the injected attributes', async () => {
    const out = await html({ size: 'l' });
    const svg = /<svg[\s\S]*<\/svg>/.exec(out)?.[0];
    const injected = 'width="38" height="38" aria-hidden="true" focusable="false" ';
    expect(svg).toContain(injected);
    expect(svg?.replace(injected, '')).toBe(LOGO.trim());
  });

  it.each([
    ['s', px('--ocx-icon-md'), '--ocx-icon-md'],
    ['m', px('--ocx-icon-lg'), '--ocx-icon-lg'],
    ['l', px('--ocx-control-2xl'), '--ocx-control-2xl'],
    ['xl', px('--ocx-control-3xl') * 2, '--ocx-control-3xl'],
  ])('size %s: width/height %ipx, the value of the token the CSS reads', async (size, edge, token) => {
    expect(edge).toBeGreaterThan(0);
    const svg = (await root({ size }))?.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe(String(edge));
    expect(svg?.getAttribute('height')).toBe(String(edge));
    // m is the default and carries no data-size; its token sits on the root rule.
    const rule = size === 'm' ? /:where\(\.ocx-logo\) \{[^}]*\}/ : new RegExp(`\\[data-size='${size}'\\] \\{[^}]*\\}`);
    expect(rule.exec(SOURCE)?.[0]).toContain(`var(${token})`);
  });

  it('the default is m, brand, mark only, a span named "ocx" with role=img', async () => {
    const el = await root();
    expect(el?.tagName).toBe('SPAN');
    expect(el?.getAttribute('role')).toBe('img');
    expect(el?.getAttribute('aria-label')).toBe('ocx');
    expect(el?.hasAttribute('data-size')).toBe(false);
    expect(el?.hasAttribute('data-tone')).toBe(false);
    expect(el?.querySelector('svg')?.getAttribute('width')).toBe('20');
    expect(el?.querySelector('span')).toBeNull();
  });

  it('href renders a link named by aria-label, no role; the svg is always hidden and unfocusable', async () => {
    const el = await root({ href: '/', label: 'ocx home', wordmark: 'ocx' });
    expect(el?.tagName).toBe('A');
    expect(el?.getAttribute('href')).toBe('/');
    expect(el?.getAttribute('aria-label')).toBe('ocx home');
    expect(el?.hasAttribute('role')).toBe(false);
    expect(el?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(el?.querySelector('svg')?.getAttribute('focusable')).toBe('false');
  });

  it('wordmark renders a span after the svg; tone=current sets data-tone', async () => {
    const el = await root({ wordmark: 'ocx', tone: 'current', size: 'xl' });
    expect([...(el?.children ?? [])].map((c) => c.tagName.toLowerCase())).toEqual(['svg', 'span']);
    expect(el?.querySelector('span')?.textContent).toBe('ocx');
    expect(el?.getAttribute('data-tone')).toBe('current');
    expect(el?.getAttribute('data-size')).toBe('xl');
  });

  it('label="" is decorative: aria-hidden root, no role, no name; a linked logo needs a label', async () => {
    const el = await root({ label: '' });
    expect(el?.getAttribute('aria-hidden')).toBe('true');
    expect(el?.hasAttribute('role')).toBe(false);
    expect(el?.hasAttribute('aria-label')).toBe(false);
    await expect(html({ href: '/', label: '' })).rejects.toThrow(/needs a label/);
  });

  it('class joins the root; no client JS, no Zag root', async () => {
    const out = await html({ class: 'x-brand', href: '/' });
    expect(out).toContain('class="ocx-logo x-brand"');
    expect(out).not.toMatch(/<script|data-zag/);
  });

  it('colour is CSS only: accent or currentColor, CanvasText in forced colours', () => {
    expect(SOURCE).toMatch(/\.ocx-logo path \{\s*fill: var\(--ocx-color-accent\);/);
    expect(SOURCE).toMatch(/\[data-tone='current'\] path \{\s*fill: currentColor;/);
    expect(SOURCE).toMatch(/forced-colors: active\)[\s\S]*fill: CanvasText;/);
  });
});
