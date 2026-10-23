// CopyMenu and ProseCodeCopy, server side (D-056, D-064, D-083, D-112): the SSR markup equals the
// ActionMenu machine's connect() for the same props (C-130a/b), the context shape adds no tab stop,
// styles (f). Behaviour under a DOM is in copy-menu.dom.test.ts and prose-code-copy.dom.test.ts.
import { readFileSync } from 'node:fs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';
import * as copyMenu from '../src/components/copy-menu.zag.mjs';
import { parts } from '../src/components/ui/menu.zag.mjs';
import { ssrApi, ssrAttrs } from '../src/components/ui/zag-runtime.mjs';

type Component = Parameters<AstroContainer['renderToString']>[0];
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: Window } };
const load = async (name: string) =>
  ((await import(`../src/components/${name}.astro`)) as { default: Component }).default;
const CopyMenu = await load('CopyMenu');
const ProseCodeCopy = await load('ProseCodeCopy');
const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});
async function render(c: Component, props: Record<string, unknown> = {}, slots: Record<string, string> = {}) {
  const html = await container.renderToString(c, { props, slots });
  return new JSDOM(`<!doctype html><body>${html}</body>`).window.document;
}

const items = [
  { value: 'identifier', label: 'Copy identifier', text: 'ocx.sh/node:24' },
  { value: 'tag', label: 'Copy tag', text: '24', meaning: 'version tag' },
  { value: 'cmd', label: 'ocx install', text: 'ocx install ocx.sh/node:24' },
];
const hosts = `<ul><li tabindex="0" data-copy='{"identifier":"a"}'>24</li><li tabindex="0" data-copy='{"tag":"b"}'>22</li></ul>`;

describe('D-056 D-083 CopyMenu SSR', () => {
  it('C-130a/b button mode: the root names the machine; every part equals connect(); items carry their text', async () => {
    const doc = await render(CopyMenu, { label: 'Copy', items });
    const root = doc.querySelector<HTMLElement>('[data-zag-root]')!;
    expect(root.dataset['zagRoot']).toBe('copy-menu');
    expect(root.dataset['zagState']).toBe('idle');
    expect(root.hasAttribute('data-context')).toBe(false);
    const own = JSON.parse(root.dataset['zagProps'] ?? '{}') as Record<string, unknown>;
    expect(own).toEqual({ positioning: { placement: 'bottom-start', strategy: 'fixed' } });
    const api = ssrApi(copyMenu.machine, copyMenu.connect, { ...own, id: root.dataset['zagId'] });
    let seen = 0;
    for (const [name, attrs] of Object.entries(parts(api, items))) {
      const el = doc.getElementById(String(attrs['id']));
      if (!el) continue; // the context trigger: only the other shape renders it
      seen++;
      const actual = Object.fromEntries([...(el?.attributes ?? [])].map((a) => [a.name, a.value]));
      expect(actual, name).toMatchObject(ssrAttrs(attrs));
    }
    expect(seen).toBe(6); // trigger, positioner, content, 3 items
    expect(doc.querySelector('[data-part="trigger"]')?.textContent).toContain('Copy');
    const rows = [...doc.querySelectorAll('[role="menuitem"]')];
    expect(
      rows.map((r) => [
        r.getAttribute('data-value'),
        r.getAttribute('data-copy-text'),
        r.getAttribute('data-copy-meaning'),
      ]),
    ).toEqual([
      ['identifier', 'ocx.sh/node:24', 'identifier'], // "Copy " leaves the meaning
      ['tag', '24', 'version tag'], // an explicit meaning wins
      ['cmd', 'ocx install ocx.sh/node:24', 'ocx install'],
    ]);
  });

  it('D-056 context mode: no trigger button, the label names the menu, and the menu adds no tab stop', async () => {
    const doc = await render(
      CopyMenu,
      { label: 'Version actions', items: items.map(({ value, label }) => ({ value, label })), context: true },
      { default: hosts },
    );
    const root = doc.querySelector<HTMLElement>('[data-zag-root]')!;
    expect(root.hasAttribute('data-context')).toBe(true);
    expect(doc.querySelector('[data-part="trigger"]')).toBeNull();
    expect(doc.querySelector('[data-part="context-trigger"]'), 'no wrapper target of its own').toBeNull();
    expect((JSON.parse(root.dataset['zagProps'] ?? '{}') as Record<string, unknown>)['aria-label']).toBe(
      'Version actions',
    );
    expect(doc.querySelector('[data-part="content"]')?.getAttribute('aria-label')).toBe('Version actions');
    // The hosts keep their own stop; nothing the menu renders is focusable while closed.
    const stops = [...doc.querySelectorAll('[tabindex]')].filter((e) => !e.closest('[hidden]'));
    expect(stops.map((e) => e.textContent)).toEqual(['24', '22']);
    expect(doc.querySelectorAll('[data-copy]')).toHaveLength(2);
    // Items have no text of their own: the host supplies it.
    expect(doc.querySelector('[data-part="item"]')?.hasAttribute('data-copy-text')).toBe(false);
  });

  it('a button menu item without a text is a build error, a context menu item needs none', async () => {
    await expect(render(CopyMenu, { label: 'x', items: [{ value: 'a', label: 'A' }] })).rejects.toThrow(/needs a text/);
    await expect(
      render(CopyMenu, { label: 'x', items: [{ value: 'a', label: 'A' }], context: true }),
    ).resolves.toBeDefined();
  });

  it('placement and the zag passthrough reach the machine props', async () => {
    const doc = await render(CopyMenu, { label: 'x', items, placement: 'top-end', zag: { loopFocus: true } });
    expect(JSON.parse(doc.querySelector<HTMLElement>('[data-zag-root]')?.dataset['zagProps'] ?? '{}')).toEqual({
      loopFocus: true,
      positioning: { placement: 'top-end', strategy: 'fixed' },
    });
  });

  it('C-130f one <style>, all of it in @layer ocx, keyed on Zag data-part, tokens only', () => {
    const src = source('../src/components/CopyMenu.astro');
    const styles = [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => (m[1] ?? '').trim());
    expect(styles).toHaveLength(1);
    expect(styles[0]).toMatch(/^@layer ocx \{[\s\S]*\}$/);
    expect(styles[0]).toMatch(/\[data-part='content'\]/);
    expect(styles[0]?.replace(/var\([^)]*\)/g, ''), 'no literal colours').not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });

  it('the island is reachable from a shipped entry: the script mounts the lazy module and holds early menus', () => {
    const src = source('../src/components/CopyMenu.astro');
    expect(src).toMatch(/import\('\.\/copy-menu\.zag\.mjs'\)/);
    expect(src).toMatch(/holdEarlyContextMenu\(root, handle\)/);
    expect(src, 'no inline handler').not.toMatch(/\son[a-z]+=/);
  });

  it('the eager script imports copy-host.mjs only: the copy and toast code stay in the lazy chunk', () => {
    const script = source('../src/components/CopyMenu.astro').match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? '';
    expect([...script.matchAll(/^\s*import .* from '([^']+)'/gm)].map((m) => m[1])).toEqual([
      './ui/zag.mjs',
      './copy-host.mjs',
    ]);
    expect(source('../src/components/copy-host.mjs'), 'copy-host.mjs imports nothing').not.toMatch(/^import /m);
  });

  it('a context root is a manual Zag root (the hosts start it); the button root loads on interaction', async () => {
    const context = await render(CopyMenu, { label: 'x', items, context: true });
    expect(context.querySelector('[data-zag-root]')?.getAttribute('data-zag-trigger')).toBe('manual');
    const button = await render(CopyMenu, { label: 'x', items: items.map((i) => ({ ...i, text: i.value })) });
    expect(button.querySelector('[data-zag-root]')?.hasAttribute('data-zag-trigger')).toBe(false);
  });
});

describe('D-064 D-112 ProseCodeCopy', () => {
  it('renders no markup of its own: the buttons are inserted by its script', async () => {
    const doc = await render(ProseCodeCopy);
    expect(doc.body.textContent?.trim()).toBe('');
    expect(doc.body.querySelectorAll('button')).toHaveLength(0);
  });

  it('is reachable: the script runs enhanceProseCode on the document, the sheet is imported', () => {
    const src = source('../src/components/ProseCodeCopy.astro');
    expect(src).toMatch(
      /import \{ enhanceProseCode \} from '\.\/prose-code-copy\.mjs';\s*enhanceProseCode\(document\);/,
    );
    expect(src).toContain("import './prose-code-copy.css';");
  });

  it('D-064 the eager script imports only the icons: copy.mjs and toast.mjs load on the first click', () => {
    const src = source('../src/components/prose-code-copy.mjs');
    expect([...src.matchAll(/^import .* from '(.+)';$/gm)].map((m) => m[1])).toEqual([
      '../icons/icons.client.generated.mjs',
    ]);
    expect(src).toContain("import('./copy.mjs')");
  });

  it('its sheet is all @layer ocx, tokens only', () => {
    const css = source('../src/components/prose-code-copy.css')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim();
    expect(css).toMatch(/^@layer ocx \{[\s\S]*\}$/);
    expect(css.replace(/var\([^)]*\)/g, ''), 'no literal colours').not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });
});
