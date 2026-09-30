// <Avatar>/<AvatarGroup> (C-130b/f): no Zag machine (D-Z17 deviation), so no JS before first
// paint; the image is stacked over the initials (no flicker, AGENTS.md assets rule), tokens-only
// styles in @layer ocx.
import { readFileSync } from 'node:fs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';

type Component = Parameters<AstroContainer['renderToString']>[0];
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: Window } };
// Template import: tsc has no .astro module types (as in chrome.test.ts).
const Avatar = ((await import(`../src/components/ui/${'Avatar'}.astro`)) as { default: Component }).default;
const AvatarGroup = ((await import(`../src/components/ui/${'AvatarGroup'}.astro`)) as { default: Component }).default;

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});
const render = async (props: Record<string, unknown>) =>
  new JSDOM(await container.renderToString(Avatar, { props: { name: 'Cole Baxter', ...props } })).window.document;

describe('Avatar SSR', () => {
  it('root is role=img named by `name`, no Zag root, nothing waits on JS', async () => {
    const root = (await render({})).querySelector('.ocx-avatar');
    expect(root?.getAttribute('role')).toBe('img');
    expect(root?.getAttribute('aria-label')).toBe('Cole Baxter');
    expect(root?.hasAttribute('data-zag-root')).toBe(false);
  });

  it('no-flicker order: initials always painted, the image over them unhidden, decorative', async () => {
    const d = await render({ src: 'https://example.test/a.jpg' });
    const [fallback, img] = [...(d.querySelector('.ocx-avatar')?.children ?? [])];
    expect(fallback?.classList.contains('ocx-avatar__fallback')).toBe(true);
    expect(fallback?.hasAttribute('hidden')).toBe(false);
    expect(img?.tagName).toBe('IMG');
    expect(img?.hasAttribute('hidden')).toBe(false);
    expect(img?.getAttribute('alt')).toBe('');
    expect((await render({})).querySelector('img'), 'no src, no img').toBeNull();
  });

  it('derives initials from up to the first two words of name, uppercased; `initials` overrides', async () => {
    const glyph = async (props: Record<string, unknown>) =>
      (await render(props)).querySelector('.ocx-avatar__fallback')?.textContent;
    expect(await glyph({ name: 'priya anand' })).toBe('PA');
    expect(await glyph({ name: 'Cher' })).toBe('C');
    expect(await glyph({ initials: 'XY' })).toBe('XY');
  });

  it('status renders a toned dot and joins the accessible name; no status renders none', async () => {
    const d = await render({ status: 'busy' });
    expect(d.querySelector('.ocx-avatar-status')?.getAttribute('data-tone')).toBe('busy');
    expect(d.querySelector('.ocx-avatar')?.getAttribute('aria-label')).toBe('Cole Baxter (busy)');
    const none = await render({});
    expect(none.querySelector('.ocx-avatar-status')).toBeNull();
    expect(none.querySelector('.ocx-avatar')?.getAttribute('aria-label')).toBe('Cole Baxter');
  });

  it('size sets data-size (default "sm")', async () => {
    expect((await render({})).querySelector('.ocx-avatar')?.getAttribute('data-size')).toBe('sm');
    expect((await render({ size: 'lg' })).querySelector('.ocx-avatar')?.getAttribute('data-size')).toBe('lg');
  });
});

describe('AvatarGroup', () => {
  const items = [{ name: 'Priya Anand' }, { name: 'Cole Baxter' }, { name: 'Dana Reyes' }, { name: 'Sam Iyer' }];
  const renderGroup = async (props: Record<string, unknown>) =>
    new JSDOM(await container.renderToString(AvatarGroup, { props })).window.document;

  it('renders one Avatar per item with no max, and no overflow tile', async () => {
    const d = await renderGroup({ items });
    expect(d.querySelectorAll('.ocx-avatar[role="img"]').length).toBe(4);
    expect(d.querySelector('.ocx-avatar-group > span:not([role])')).toBeNull();
  });

  it('caps at max and adds one "+N" overflow tile', async () => {
    const d = await renderGroup({ items, max: 2 });
    expect(d.querySelectorAll('.ocx-avatar[role="img"]').length).toBe(2);
    const overflow = d.querySelector('.ocx-avatar-group > span:not([role])');
    expect(overflow?.textContent?.trim()).toBe('+2');
  });
});

describe('C-130f Avatar/AvatarGroup styles', () => {
  it('@layer ocx, keyed on the image class and data-size, tokens only', () => {
    const css = /<style>([\s\S]*)<\/style>/.exec(
      readFileSync(new URL('../src/components/ui/Avatar.astro', import.meta.url), 'utf8'),
    )?.[1];
    expect(css?.trim()).toMatch(/^@layer ocx \{[\s\S]*\}$/);
    expect(css).toContain('.ocx-avatar__image');
    expect(css).toContain("[data-size='lg']");
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(/i);
  });

  it('no Zag import, and the showcase breaks its image without a network error', () => {
    const src = readFileSync(new URL('../src/components/ui/Avatar.astro', import.meta.url), 'utf8');
    expect(src).not.toContain('@zag-js');
    // A failed network fetch (404, unresolvable host) logs a console error: Lighthouse
    // best-practices drops to 0.96 (errors-in-console). A `data:` URL fails silently.
    const mdx = readFileSync(
      new URL('../../../examples/starlight/src/stories/avatar/states.mdx', import.meta.url),
      'utf8',
    );
    expect(mdx).toMatch(/label="broken image"><Avatar [^>]*src="data:/);
  });

  it('AvatarGroup styles are @layer ocx, tokens only', () => {
    const css = /<style>([\s\S]*)<\/style>/.exec(
      readFileSync(new URL('../src/components/ui/AvatarGroup.astro', import.meta.url), 'utf8'),
    )?.[1];
    expect(css?.trim()).toMatch(/^@layer ocx \{[\s\S]*\}$/);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(/i);
  });
});
