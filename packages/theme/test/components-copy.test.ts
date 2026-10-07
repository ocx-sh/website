// Z7 clipboard + toast, server side: C-180 CopyButton and C-181 toaster SSR (C-130 a, b, f, k),
// C-180/C-182 copy titles. Behaviour under a DOM lives in components-copy-live.test.ts (the
// Container API cannot render .astro under the jsdom environment).
import { readFileSync } from 'node:fs';
import * as clipboard from '@zag-js/clipboard';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';
import { copiedTitle } from '../src/components/toast.mjs';
import * as toastModule from '../src/components/toast.zag.mjs';
import { ssrApi } from '../src/components/ui/zag-runtime.mjs';
import { expectSsrMatchesConnect } from './zag-helpers.ts';

type Component = Parameters<AstroContainer['renderToString']>[0];
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: Window } };
// Template import: tsc has no .astro module types (as in chrome.test.ts).
const component = async (name: string) =>
  ((await import(`../src/components/${name}.astro`)) as { default: Component }).default;
const override = async (name: string) =>
  ((await import(`../src/starlight/${name}.astro`)) as { default: Component }).default;
const CopyButton = await component('CopyButton');
const Footer = await override('Footer');
const zagProps = (el: HTMLElement): Record<string, unknown> => {
  const value: unknown = JSON.parse(el.dataset['zagProps'] ?? '{}');
  return typeof value === 'object' && value !== null ? { ...value } : {};
};
const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

let container: AstroContainer;
let document: Document;
beforeAll(async () => {
  container = await AstroContainer.create();
});
const parse = (html: string) => {
  document = new JSDOM(`<body>${html}</body>`).window.document;
  return document;
};

describe('C-180 / C-182 copy titles', () => {
  it.each([
    ['short text verbatim', 'ocx.sh/pnpm/pnpm:11', 'Copied ocx.sh/pnpm/pnpm:11'],
    ['exactly 40 characters verbatim', 'x'.repeat(40), `Copied ${'x'.repeat(40)}`],
    ['longer text cut to 40 with an ellipsis', 'y'.repeat(41), `Copied ${'y'.repeat(39)}…`],
  ])('%s', (_, text, title) => {
    expect(copiedTitle(text)).toBe(title);
  });
});

describe('C-180 CopyButton SSR (C-130 a, b)', () => {
  const render = async (props: Record<string, unknown>) => {
    parse(await container.renderToString(CopyButton, { props }));
    return document.querySelector<HTMLElement>('[data-zag-root]')!;
  };

  it('C-130b the root names the machine, starts idle and carries id and props', async () => {
    const root = await render({ value: 'ocx add uv', label: 'install command' });
    expect(root.dataset.zagRoot).toBe('clipboard');
    expect(root.dataset.zagState).toBe('idle');
    expect(root.dataset.zagId).toMatch(/\S/);
    expect(zagProps(root)).toEqual({ timeout: 1500, value: 'ocx add uv' });
    expect(root.dataset.label).toBe('install command');
    // Named after the label, so several buttons on a page stay distinguishable; starts with the visible "copy".
    expect(root.querySelector('[data-part="trigger"]')?.getAttribute('aria-label')).toBe('Copy install command');
  });

  it('C-130a root, trigger and both indicators equal connect() for the same props', async () => {
    const html = await container.renderToString(CopyButton, { props: { value: 'v', zag: { timeout: 900 } } });
    parse(html);
    const root = document.querySelector<HTMLElement>('[data-zag-root]')!;
    const props: Record<string, unknown> = { ...zagProps(root), id: root.dataset.zagId };
    expect(props.timeout).toBe(900);
    const api = ssrApi(clipboard.machine, clipboard.connect, props);
    const own = { 'data-zag-root': 'clipboard', 'data-zag-state': 'idle', 'data-zag-id': props.id };
    expectSsrMatchesConnect(html, 'root', {
      ...api.getRootProps(),
      ...own,
      'data-zag-props': root.dataset.zagProps,
    });
    expectSsrMatchesConnect(html, 'trigger', {
      ...api.getTriggerProps(),
      'data-variant': 'secondary',
      'data-size': 's',
    });
    const [idle, done] = [...document.querySelectorAll('[data-part="indicator"]')];
    expect(idle?.hasAttribute('hidden')).toBe(false);
    expect(done?.hasAttribute('hidden')).toBe(true);
    expect(idle?.textContent?.trim()).toBe('copy');
    expect(done?.textContent?.trim()).toBe('copied');
  });

  it('C-130a two buttons on one page get distinct ids', async () => {
    const a = await render({ value: 'a' });
    const idA = a.dataset.zagId;
    const b = await render({ value: 'b' });
    expect(b.dataset.zagId).not.toBe(idA);
  });

  it('C-130f styles sit in @layer ocx, keyed on Zag parts, tokens only', () => {
    const css = /<style[^>]*>([\s\S]*)<\/style>/.exec(source('../src/components/CopyButton.astro'))?.[1] ?? '';
    expect(css.trim().startsWith('@layer ocx')).toBe(true);
    expect(css).toMatch(/\[data-copied\]/);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  });

  it('R5 both labels share one grid cell: the hidden one only fades, so the button keeps the "copied" width', async () => {
    await render({ value: 'x' });
    const labels = document.querySelector('.ocx-copy__labels');
    expect([...(labels?.children ?? [])].map((el) => el.getAttribute('data-part'))).toEqual(['indicator', 'indicator']);
    const css = /<style[^>]*>([\s\S]*)<\/style>/.exec(source('../src/components/CopyButton.astro'))?.[1] ?? '';
    expect(css).toMatch(/\.ocx-copy__labels > \* \{[^}]*grid-area: 1 \/ 1;/);
    expect(css).toMatch(/\.ocx-copy__labels > \[hidden\] \{\s*opacity: 0;\s*visibility: hidden;/);
    expect(css).toMatch(/opacity var\(--ocx-duration-moderate\) var\(--ocx-ease-in-out\)/);
    expect(css).not.toMatch(/display: none/);
  });
});

describe('C-130k CopyButton Props', () => {
  it('are value, label and the zag passthrough', () => {
    expect(source('../src/components/CopyButton.astro')).toMatch(
      /interface Props \{[\s\S]*value: string;[\s\S]*label\?: string;[\s\S]*zag\?: ZagProps<ClipboardProps>;/,
    );
  });
});

describe('C-181 toaster SSR in the Footer override', () => {
  const renderFooter = async () => {
    const t = Object.assign((key: string) => key, { all: () => ({}) });
    return container.renderToString(Footer, {
      request: new Request('https://ocx.sh/docs/x/'),
      locals: { t, starlightRoute: { pagination: {}, dir: 'ltr' } } as unknown as App.Locals,
    });
  };

  it('C-130b the region is a manual Zag root, idle, with no toast markup', async () => {
    parse(await renderFooter());
    const root = document.querySelector<HTMLElement>('[data-zag-root="toast"]')!;
    expect(root.dataset.zagState).toBe('idle');
    expect(root.dataset.zagTrigger).toBe('manual');
    expect(root.dataset.zagId).toBe('ocx-toaster');
    expect(root.children).toHaveLength(0);
  });

  it("C-130a (live-region subset) SSR carries the group part's aria-live; the rest is spread at start", async () => {
    parse(await renderFooter());
    const root = document.querySelector<HTMLElement>('[data-zag-root]')!;
    const group = ssrApi(toastModule.machine, toastModule.connect, {
      ...zagProps(root),
      id: root.dataset.zagId,
    }).getGroupProps();
    const own = [...root.attributes].map((a) => a.name).filter((n) => !n.startsWith('data-zag-') && n !== 'class');
    expect(own).toEqual(['aria-live']);
    expect(root.getAttribute('aria-live')).toBe(group['aria-live']);
  });

  it('C-181 zero bytes of toast JS before the first ocx:toast: the toaster glue only dynamic-imports Zag', () => {
    const glue = source('../src/starlight/toaster.mjs');
    expect(glue).toMatch(/import\(['"]\.\.\/components\/toast\.zag\.mjs['"]\)/);
    // Its one static import is the trigger layer every page loads already (no extra request).
    const statics = [...glue.matchAll(/^import\s[^(]*?from\s*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
    expect(statics).toEqual(['../components/ui/zag.mjs']);
    // It rides Search.astro's every-page script; the Footer has no script of its own (one request).
    expect(source('../src/chrome.mjs')).toMatch(/installToaster\(doc\)/);
    expect(source('../src/starlight/Search.astro')).toMatch(/mountChrome\(document\)/);
    expect(source('../src/starlight/Footer.astro')).not.toMatch(/<script/);
    // Its inline copy of the title helper matches toast.mjs.
    expect(glue).toContain('`Copied ${text.length > 40 ? `${text.slice(0, 39)}…` : text}`');
    expect(source('../src/components/toast.mjs')).toContain(
      '`Copied ${text.length > 40 ? `${text.slice(0, 39)}…` : text}`',
    );
  });
});
