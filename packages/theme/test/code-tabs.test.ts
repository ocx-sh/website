// <Tabs> + <TabItem> on Zag `tabs` (C-150…C-152, C-130a/b/f): panel extraction, SSR equal to
// connect(), the synced-tab restore script, and the table/stylesheet rewrites MarkdownContent keeps.
import { existsSync, readFileSync } from 'node:fs';
import * as tabsZag from '@zag-js/tabs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';
import { ICONS, type IconName } from '../src/icons/icons.mjs';
import { readDom, selectTab } from '../src/components/tabs.zag.mjs';
import { ssrApi, ssrAttrs } from '../src/components/ui/zag-runtime.mjs';
import * as tabIcons from '../src/starlight/tab-icons.mjs';

type Win = Window & typeof globalThis;
type Component = Parameters<AstroContainer['renderToString']>[0];
// Template import: tsc has no .astro module types (as in chrome.test.ts).
const component = async (name: string) =>
  ((await import(`../src/components/${name}.astro`)) as { default: Component }).default;
const Tabs = await component('Tabs');
const TabItem = await component('TabItem');
const MarkdownContent = ((await import(`../src/starlight/${'MarkdownContent'}.astro`)) as { default: Component })
  .default;
interface DomOptions {
  runScripts?: 'dangerously';
  url?: string;
  beforeParse?: (win: Win) => void;
}
const { JSDOM } = jsdom as { JSDOM: new (html: string, opts?: DomOptions) => { window: Win } };
const doc = (html: string, opts?: DomOptions) => new JSDOM(html, opts).window.document;

const KEYS = ['shell', 'powershell', 'nushell', 'fish', 'elvish', 'cmd'] as const;
const read = (rel: string) => readFileSync(new URL(`../src/${rel}`, import.meta.url), 'utf8');
/** What <TabItem> renders, as the <Tabs> slot receives it. */
const item = (label: string, body: string, icon?: string) =>
  `<div data-ocx-tab data-label="${label}"${icon ? ` data-icon="${icon}"` : ''}>${body}</div>`;
const SHELLS = [
  ['Shell', 'shell'],
  ['PowerShell', 'powershell'],
  ['fish', 'fish'],
] as const;
const shellSlot = SHELLS.map(([l, k]) => item(l, `<pre><code>${l}</code></pre>`, k)).join('\n');

/** Attributes of `el` a test compares with connect(): wrapper-owned ones dropped. */
const OWN = /^(class|data-astro-.*|data-zag-(root|state|props|id)|data-sync-key)$/;
const zagAttrs = (el: Element | null | undefined) =>
  Object.fromEntries([...(el?.attributes ?? [])].filter((a) => !OWN.test(a.name)).map((a) => [a.name, a.value]));

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});
const renderTabs = (slot: string, props: Record<string, unknown> = {}) =>
  container.renderToString(Tabs, { props, slots: { default: slot } });

describe('C-150 tabPanels', () => {
  it('C-150 reads each top-level panel label and icon; nested panels belong to their own Tabs', () => {
    const nested = item('Inner', 'x');
    const { items } = tabIcons.tabPanels(`${item('A', `<div>${nested}</div>`, 'fish')}\n${item('B &amp; C', nested)}`);
    expect(items).toEqual([{ label: 'A', icon: 'fish' }, { label: 'B & C' }]);
  });

  it('C-150 replaces only each panel opening tag; every other byte is kept', () => {
    const slot = `${item('A', '<p>a</p>')}\n<!-- <div data-ocx-tab> -->\n${item('B', '<div>b</div>')}`;
    const { html } = tabIcons.tabPanels(slot);
    expect(html((i) => ({ id: `p${i}`, hidden: i ? '' : 'x' }))).toBe(
      '<div id="p0" hidden="x"><p>a</p></div>\n<!-- <div data-ocx-tab> -->\n<div id="p1" hidden=""><div>b</div></div>',
    );
  });

  it('C-150 escapes the attribute values it writes', () => {
    const { html } = tabIcons.tabPanels(item('A', ''));
    expect(html(() => ({ title: 'a "b" & <c>' }))).toBe('<div title="a &quot;b&quot; &amp; &lt;c>"></div>');
  });
});

describe('C-150 TabItem', () => {
  it('C-150 renders a marked panel with its label and icon and the slot inside', async () => {
    const html = await container.renderToString(TabItem, {
      props: { label: 'fish', icon: 'fish' },
      slots: { default: '<p>body</p>' },
    });
    const el = doc(html).querySelector('[data-ocx-tab]');
    expect(el?.getAttribute('data-label')).toBe('fish');
    expect(el?.getAttribute('data-icon')).toBe('fish');
    expect(el?.innerHTML).toBe('<p>body</p>');
  });
});

describe('C-130a/b Tabs SSR equals connect()', () => {
  it('C-130b root carries data-zag-root="tabs", data-zag-state="idle", data-zag-props and the SSR id', async () => {
    const root = doc(await renderTabs(shellSlot, { zag: { loopFocus: false } })).querySelector('[data-zag-root]');
    expect(root?.getAttribute('data-zag-root')).toBe('tabs');
    expect(root?.getAttribute('data-zag-state')).toBe('idle');
    expect(JSON.parse(root?.getAttribute('data-zag-props') ?? '')).toEqual({ defaultValue: 'shell', loopFocus: false });
    expect(root?.getAttribute('data-zag-id')).toMatch(/^ocx-ui-tabs-\d+$/);
  });

  it('C-130a every part equals ssrApi for the same props, with no data-focus; triggers are <button role=tab>', async () => {
    const d = doc(await renderTabs(shellSlot));
    const root = d.querySelector<HTMLElement>('[data-zag-root]');
    const api = ssrApi(tabsZag.machine, tabsZag.connect, { id: root?.dataset['zagId'], defaultValue: 'shell' });
    expect(zagAttrs(root)).toEqual(ssrAttrs(api.getRootProps()));
    expect(zagAttrs(d.querySelector('[data-part="list"]'))).toEqual(ssrAttrs(api.getListProps()));
    const triggers = [...d.querySelectorAll('[data-part="trigger"]')];
    const contents = [...d.querySelectorAll('[data-part="content"]')];
    const values = ['shell', 'powershell', 'fish'];
    expect(triggers.map((t) => t.getAttribute('data-value'))).toEqual(values);
    values.forEach((value, i) => {
      expect(zagAttrs(triggers[i])).toEqual(ssrAttrs(api.getTriggerProps({ value })));
      expect(zagAttrs(contents[i])).toEqual(ssrAttrs(api.getContentProps({ value })));
    });
    expect(triggers.every((t) => t.tagName === 'BUTTON' && t.getAttribute('role') === 'tab')).toBe(true);
    expect(triggers.map((t) => t.textContent?.trim())).toEqual(['Shell', 'PowerShell', 'fish']);
    expect(d.querySelector('[data-focus], [data-focus-visible], [data-ocx-tab]')).toBeNull();
    expect(contents.map((c) => c.hasAttribute('hidden'))).toEqual([false, true, true]);
    expect(contents[2]?.innerHTML).toBe('<pre><code>fish</code></pre>');
  });

  it('C-150 values are id-safe slugs of the labels, unique within the group', async () => {
    const d = doc(await renderTabs([item('macOS &amp; Linux', ''), item('Win', ''), item('win', '')].join('')));
    const values = [...d.querySelectorAll('[data-part="trigger"]')].map((t) => t.getAttribute('data-value'));
    expect(values).toEqual(['macos-linux', 'win', 'win-2']);
    for (const el of d.querySelectorAll('[id]')) expect(el.id).not.toMatch(/\s/);
  });

  it('C-152 the icon is a prop: an inline registry <svg> before the label, none without it', async () => {
    const d = doc(await renderTabs(`${item('Shell', '', 'shell')}${item('Docker', '')}`));
    const [shell, docker] = [...d.querySelectorAll('[data-part="trigger"]')];
    const icon = shell?.firstElementChild;
    expect(icon?.tagName.toLowerCase()).toBe('svg');
    expect(icon?.getAttribute('data-icon')).toBe('shell');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(icon?.querySelector('[fill], [stroke]:not([stroke="currentColor"])')).toBeNull();
    expect(docker?.querySelector('svg')).toBeNull();
  });

  it('C-150 an empty or panel-less slot renders no tab list', async () => {
    const d = doc(await renderTabs('<p>no panels</p>'));
    expect(d.querySelector('[data-part="list"]')).toBeNull();
  });
});

describe('C-151 syncKey restore script', () => {
  const page = async (storage: string | null | { throws: true }) => {
    const group = await renderTabs(shellSlot, { syncKey: 'shell' });
    const other = await renderTabs(shellSlot, { syncKey: 'other' });
    return doc(`<!doctype html><body>${group}${other}</body>`, {
      runScripts: 'dangerously',
      url: 'https://ocx.sh/docs/',
      beforeParse(win) {
        if (typeof storage === 'object' && storage !== null)
          Object.defineProperty(win, 'localStorage', {
            get() {
              throw new Error('SecurityError');
            },
          });
        else if (storage !== null) win.localStorage.setItem('starlight-synced-tabs__shell', storage);
      },
    });
  };
  const selected = (d: Document) =>
    [...d.querySelectorAll('[data-zag-root]')].map((r) => r.querySelector('[aria-selected="true"]')?.textContent);

  it('C-151 rewrites the SSR selection of every group with the stored key while the page parses', async () => {
    const d = await page('fish');
    expect(selected(d)).toEqual(['fish', 'Shell']);
    const root = d.querySelector<HTMLElement>('[data-sync-key="shell"]');
    const fish = root?.querySelector('[data-value="fish"]');
    expect(fish?.getAttribute('tabindex')).toBe('0');
    expect(fish?.hasAttribute('data-selected')).toBe(true);
    expect(fish?.getAttribute('aria-controls')).toBe(fish?.id.replace(':trigger-', ':content-'));
    const shell = root?.querySelector('[data-value="shell"]');
    expect([shell?.getAttribute('tabindex'), shell?.hasAttribute('aria-controls')]).toEqual(['-1', false]);
    const panels = [...(root?.querySelectorAll('[data-part="content"]') ?? [])];
    expect(panels.map((p) => p.hasAttribute('hidden'))).toEqual([true, true, false]);
    expect(panels.map((p) => p.hasAttribute('data-selected'))).toEqual([false, false, true]);
    expect(root && readDom(root)).toEqual({ defaultValue: 'fish' });
  });

  it('C-151 an unknown stored label, no stored label, or a throwing localStorage leave the SSR default', async () => {
    for (const storage of ['zsh', null, { throws: true } as const])
      expect(selected(await page(storage))).toEqual(['Shell', 'Shell']);
  });

  it('C-151 the script is inline, inside the group, and only on synced groups', async () => {
    const d = doc(`${await renderTabs(shellSlot, { syncKey: 'k</script>' })}${await renderTabs(shellSlot)}`);
    const [synced, plain] = [...d.querySelectorAll('[data-zag-root]')];
    const script = synced?.lastElementChild;
    expect(script?.tagName).toBe('SCRIPT');
    expect(script?.hasAttribute('src')).toBe(false);
    expect(script?.textContent).toContain('starlight-synced-tabs__k\\u003c/script>');
    expect(plain?.querySelector('script')).toBeNull();
  });

  it('C-151 selectTab reports whether anything changed', async () => {
    const root = doc(await renderTabs(shellSlot)).querySelector<HTMLElement>('[data-zag-root]');
    if (!root) throw new Error('no root');
    expect(selectTab(root, 'Shell')).toBe(false);
    expect(selectTab(root, 'nope')).toBe(false);
    expect(selectTab(root, null)).toBe(false);
    expect(selectTab(root, 'PowerShell')).toBe(true);
    expect(root.querySelector('[aria-selected="true"]')?.textContent).toBe('PowerShell');
  });
});

describe('C-152 MarkdownContent no longer rewrites tabs', () => {
  it('C-152 decorateTabs is gone from tab-icons.mjs', () => {
    expect('decorateTabs' in tabIcons).toBe(false);
    expect('iconForLabel' in tabIcons).toBe(false);
  });

  it('C-152 the slot passes through byte-identical apart from tables and stylesheet links', async () => {
    const slot = '<a role="tab" href="#p">fish</a><p>x</p>';
    const t = Object.assign((key: string) => key, { all: () => ({}) });
    const html = await container.renderToString(MarkdownContent, {
      request: new Request('https://ocx.sh/docs/x/'),
      slots: { default: slot },
      locals: {
        t,
        starlightRoute: {
          entry: { data: { title: 'T' } },
          toc: undefined,
          editUrl: undefined,
          pagination: {},
          dir: 'ltr',
        },
      } as unknown as App.Locals,
    });
    expect(doc(html).querySelector('.sl-markdown-content')?.innerHTML).toContain(slot);
  });
});

describe('S-001 quote-aware rewrite', () => {
  // Expressive Code keeps raw code in data-code; `<` inside it is not markup.
  const copy = (code: string) =>
    `<div class="copy"><button title="Copy" data-code="${code}"><div></div></button></div>`;

  it.each([
    ['a <table> in data-code', copy('<table><tr><td>x</td></tr></table>')],
    ['an unclosed <table> in data-code', `${copy('<table>')}<p>after</p>`],
    ['a panel mark in data-code', copy("<div data-ocx-tab data-label='x'>")],
    ['a table in a comment', '<!-- <table> -->'],
  ])('S-001: %s is left byte-identical', (_, input) => {
    expect(tabIcons.wrapTables(input)).toBe(input);
    expect(tabIcons.tabPanels(input).items).toEqual([]);
  });

  it('S-001: a data-code <table> before a real table does not swallow it', () => {
    const real = '<table><tr><td>1</td></tr></table>';
    expect(tabIcons.wrapTables(`${copy('<table>')}${real}`)).toBe(
      `${copy('<table>')}${tabIcons.tableWrap('Table')}${real}</div>`,
    );
  });
});

describe('S-001 wrapTables', () => {
  const table = '<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>';

  it('S-001: a bare table is wrapped once in a focusable, labelled region (idempotent)', () => {
    const once = tabIcons.wrapTables(`<p>x</p>${table}`);
    expect(tabIcons.wrapTables(once)).toBe(once);
    const region = doc(once).querySelector('.ocx-table-scroll');
    expect(region?.getAttribute('tabindex')).toBe('0');
    expect(region?.getAttribute('role')).toBe('region');
    expect(region?.getAttribute('aria-label')).toBe('Table');
    expect(region?.firstElementChild?.tagName).toBe('TABLE');
    expect(doc(once).querySelectorAll('.ocx-table-scroll')).toHaveLength(1);
  });

  it('S-001: each region is named after its preceding heading, numbered when a name repeats (landmark-unique)', () => {
    const h = (id: string, text: string) =>
      `<div class="sl-heading-wrapper level-h2"><h2 id="${id}">${text}</h2><a href="#${id}"><span class="sr-only">Section titled ${text}</span></a></div>`;
    const html = tabIcons.wrapTables(
      `${table}${h('props', 'Props')}${table}${h('ev', 'Events &amp; <code>keys</code>')}${table}${table}`,
    );
    const labels = [...doc(html).querySelectorAll('.ocx-table-scroll')].map((r) => r.getAttribute('aria-label'));
    expect(labels).toEqual(['Table', 'Props table', 'Events & keys table', 'Events & keys table 2']);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('S-001: a classed table is not wrapped, and a nested table only via its outer one', () => {
    const classed = '<table class="own"><tr><td>1</td></tr></table>';
    expect(tabIcons.wrapTables(classed)).toBe(classed);
    const nested = doc(tabIcons.wrapTables(`<table><tr><td>${table}</td></tr></table>`));
    expect(nested.querySelectorAll('.ocx-table-scroll')).toHaveLength(1);
  });

  it('S-001: tables inside a tab panel and inside an aside are wrapped', () => {
    const input =
      `<div data-part="content" role="tabpanel">${table}</div>` +
      `<aside class="starlight-aside"><div class="starlight-aside__content">${table}</div></aside>`;
    const d = doc(tabIcons.wrapTables(input));
    expect(d.querySelectorAll('[role="tabpanel"] > .ocx-table-scroll > table')).toHaveLength(1);
    expect(d.querySelectorAll('.starlight-aside__content > .ocx-table-scroll > table')).toHaveLength(1);
  });
});

describe('S-001 splitStylesheets', () => {
  it('S-001: pulls every stylesheet link out of the content, everything else byte-identical', () => {
    const link = '<link rel="stylesheet" href="/_astro/ec.css">';
    const input = `<p>a</p><div class="expressive-code">${link}<script type="module" src="/ec.js"></script><pre>x</pre></div>`;
    expect(tabIcons.splitStylesheets(input)).toEqual({ links: link, rest: input.replace(link, '') });
  });

  it('S-001: HTML without stylesheet links is returned whole; other links stay', () => {
    const input = '<link rel="preload" href="/f.woff2"><p>a</p>';
    expect(tabIcons.splitStylesheets(input)).toEqual({ links: '', rest: input });
  });
});

describe('S-001 shell icons are registry icons and C-130f CSS', () => {
  it.each(KEYS)('S-001: %s is a registry icon; no url() asset behind it', (key) => {
    expect(ICONS[key as IconName]).toBeDefined();
    expect(existsSync(new URL(`../src/icons/${key}.svg`, import.meta.url))).toBe(false);
    expect(read('starlight/starlight.css')).not.toMatch(/data-ocx-icon|icons\/\w+\.svg/);
  });

  it('C-130f Tabs styles live in @layer ocx, keyed on the Zag parts, tokens only; TabIcon lists every key', () => {
    const css = /<style is:global>([\s\S]*)<\/style>/.exec(read('components/Tabs.astro'))?.[1] ?? '';
    expect(css.trim()).toMatch(/^@layer ocx \{[\s\S]*\}$/);
    expect(css).toContain(".ocx-tabs > [data-part='list'] > [data-part='trigger']");
    expect(css).toContain('[data-selected]');
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(|\b\d+px\b/i);
    expect(read('components/TabItem.astro')).toContain(KEYS.map((k) => `'${k}'`).join(' | '));
    expect(css).not.toContain('url(');
    expect(read('starlight/starlight.css')).not.toContain('starlight-tabs');
  });

  it('panels stack in one grid cell; a hidden panel stays laid out but invisible; the crossfade is live-only', () => {
    const css = /<style is:global>([\s\S]*)<\/style>/.exec(read('components/Tabs.astro'))?.[1] ?? '';
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const rule = (sel: string) =>
      bare
        .split('}')
        .filter((b) => b.split('{')[0]!.trim() === sel)
        .join('}');
    expect(rule('.ocx-tabs')).toMatch(/display: grid/);
    expect(rule(".ocx-tabs > [data-part='content']")).toMatch(/grid-area: 2 \/ 1/);
    const hidden = rule(".ocx-tabs > [data-part='content'][hidden]");
    expect(hidden).toMatch(/display: block/);
    expect(hidden).toMatch(/visibility: hidden/);
    expect(hidden).toMatch(/opacity: 0/);
    expect(bare).not.toContain('@starting-style');
    const live = rule(".ocx-tabs[data-zag-state='live'] > [data-part='content']");
    expect(live).toMatch(/transition:[\s\S]*opacity[\s\S]*visibility/);
    const lone = ':has(> .expressive-code:only-child)';
    const code = rule(`.ocx-tabs > [data-part='content'][hidden]${lone}`);
    expect(code).toMatch(/opacity: 1/); // the frame never fades
    expect(rule(`.ocx-tabs > [data-part='content'][hidden]${lone} pre code`)).toMatch(/opacity: 0/);
    expect(rule(`.ocx-tabs[data-zag-state='live'] > [data-part='content'][hidden]${lone}`)).toMatch(
      /visibility 0s linear var\(--ocx-duration-enter\)/,
    );
    expect(bare.match(/transition:/g)?.length).toBe(6);
  });
});
