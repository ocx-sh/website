// Overlay primitives (ui/overlay.css): Menu (WP14b, Popover API), Select and Combobox on Zag
// (C-161, C-162): SSR markup equals connect() (C-130a), root attributes (C-130b), CSS contract.
// Behaviour is Zag's: tests/e2e/zag-form.spec.ts drives it.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';
import { ssrApi } from '../src/components/ui/zag-runtime.mjs';
import { ICONS } from '../src/icons/icons.mjs';
import { domAttrs, expectSsrMatchesConnect } from './zag-helpers.ts';

type Win = Window & typeof globalThis;
type Component = Parameters<AstroContainer['renderToString']>[0];
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: Win } };

const UI = new URL('../src/components/ui/', import.meta.url);
// Template import: tsc has no .astro module types (as in chrome.test.ts).
const load = async (name: string) =>
  ((await import(`../src/components/ui/${name}.astro`)) as { default: Component }).default;
const Select = await load('Select');
const Menu = await load('Menu');
const Combobox = await load('Combobox');
const select = await import('../src/components/ui/select.zag.mjs');
const combobox = await import('../src/components/ui/combobox.zag.mjs');

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});

async function render(c: Component, ...all: Record<string, unknown>[]): Promise<Document> {
  const parts = await Promise.all(all.map((props) => container.renderToString(c, { props })));
  return new JSDOM(`<!doctype html><body>${parts.join('')}</body>`).window.document;
}

const source = (file: string) => readFileSync(new URL(file, UI), 'utf8');
const styleOf = (file: string) =>
  [...source(file).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1] ?? '').join('\n');
const overlayCss = () => (existsSync(new URL('overlay.css', UI)) ? source('overlay.css') : '');
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

type Rule = { selector: string; body: string; at: string[] };
/** Qualified rules with their enclosing at-rule preludes (outermost first). Brace-matched, like scripts/css. */
function rules(css: string): Rule[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: Rule[] = [];
  const stack: { prelude: string; start: number }[] = [];
  let mark = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '{') {
      stack.push({ prelude: norm(src.slice(mark, i)), start: i + 1 });
      mark = i + 1;
    } else if (c === '}') {
      const top = stack.pop();
      if (top && !top.prelude.startsWith('@'))
        out.push({ selector: top.prelude, body: src.slice(top.start, i), at: stack.map((s) => s.prelude) });
      mark = i + 1;
    } else if (c === ';') mark = i + 1;
  }
  return out;
}
const inLayer = (r: Rule) => r.at[0] === '@layer ocx';
const OV_VARS = ['--_ov-bg', '--_ov-border', '--_ov-radius', '--_ov-shadow'];

const OPTIONS = [
  { value: '', label: 'All licenses' },
  { value: 'MIT', label: 'MIT', meta: '12' },
  { value: 'Apache-2.0', label: 'Apache-2.0', meta: '3' },
  { value: 'GPL', label: 'GPL', disabled: true },
];
const ITEMS = [
  { label: 'Docs', href: '/docs/' },
  { label: 'Integrations', href: '/integrations/', current: true },
  { label: 'Apps', href: '/apps/' },
];

const selectApi = (props: Record<string, unknown>, options = OPTIONS) =>
  ssrApi(select.machine, select.connect, { ...props, collection: select.toCollection(options) });
const zagIdOf = (doc: Document, root: string) =>
  doc.querySelector(`[data-zag-root="${root}"]`)?.getAttribute('data-zag-id') ?? '';

describe('C-161 Select markup (Zag select)', () => {
  it('C-130a C-161 SSR of every rendered part equals connect() for the same props; no data-focus', async () => {
    for (const props of [
      { label: 'License', options: OPTIONS },
      { label: 'License', options: OPTIONS, value: 'MIT', disabled: true, 'aria-invalid': 'true', name: 'lic' },
    ]) {
      const html = await container.renderToString(Select, { props });
      const doc = new JSDOM(html).window.document;
      const id = zagIdOf(doc, 'select');
      const api = selectApi({
        id,
        defaultValue: [props.value ?? ''],
        ...(props.disabled && { disabled: true, invalid: true, name: 'lic' }),
      });
      expectSsrMatchesConnect(html, 'label', api.getLabelProps());
      expectSsrMatchesConnect(html, 'trigger', api.getTriggerProps());
      expectSsrMatchesConnect(html, 'value-text', api.getValueTextProps());
      expectSsrMatchesConnect(html, 'indicator', {
        ...api.getIndicatorProps(),
        viewBox: ICONS['chevron-down'].viewBox,
        focusable: 'false',
      });
      expect(html).not.toMatch(/data-focus/);
    }
  });

  it('C-130b C-106 root: data-zag-root, idle, data-zag-props = the zag passthrough only', async () => {
    const doc = await render(Select, { label: 'License', options: OPTIONS, zag: { loopFocus: true } });
    const root = doc.querySelector('.ocx-ui-select');
    expect(root?.getAttribute('data-zag-root')).toBe('select');
    expect(root?.getAttribute('data-zag-state')).toBe('idle');
    expect(root?.getAttribute('data-zag-id')).toMatch(/^ocx-ui-select-\d+$/);
    expect(JSON.parse(root?.getAttribute('data-zag-props') ?? '')).toEqual({ loopFocus: true });
  });

  it('C-161 the trigger is a combobox named by the label and shows the chosen label; none chosen = the first enabled option (as native)', async () => {
    const doc = await render(Select, { label: 'License', options: OPTIONS, value: 'Apache-2.0', class: 'extra' });
    const root = doc.querySelector('.ocx-ui-select');
    expect(root?.classList.contains('extra')).toBe(true);
    const trigger = root?.querySelector('button.ocx-ui-select__control');
    expect(trigger?.getAttribute('role')).toBe('combobox');
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
    expect(doc.getElementById(trigger?.getAttribute('aria-labelledby') ?? '')?.textContent.trim()).toBe('License');
    expect(trigger?.textContent.trim()).toBe('Apache-2.0');
    expect(trigger?.querySelector('svg.ocx-ui-select__icon')?.getAttribute('aria-hidden')).toBe('true');
    const first = (await render(Select, { label: 'L', options: OPTIONS.slice(1) })).querySelector('button');
    expect(first?.textContent.trim()).toBe('MIT');
  });

  it('C-161 an option `icon` rides on its native <option> (data-icon: svg markup) and shows in the trigger while selected; none, no glyph', async () => {
    const options = [
      { value: 'a', label: 'Alpha', icon: 'linux' },
      { value: 'b', label: 'Beta', icon: 'apple' },
    ];
    const doc = await render(Select, { label: 'L', options, value: 'b' });
    const glyph = doc.querySelector('.ocx-ui-select__control > .ocx-ui-select__glyph');
    expect(glyph?.querySelector('svg')?.getAttribute('data-icon')).toBe('apple');
    expect(glyph?.nextElementSibling?.getAttribute('data-part')).toBe('value-text');
    expect(
      [...doc.querySelectorAll('option')].map((o) => o.dataset['icon']?.match(/data-icon="([^"]+)"/)?.[1]),
    ).toEqual(['linux', 'apple']);
    expect((await render(Select, { label: 'L', options: OPTIONS })).querySelector('.ocx-ui-select__glyph')).toBeNull();
  });

  it('C-161 the hidden native <select> holds every option (value, label, data-meta, disabled) and the chosen one', async () => {
    const doc = await render(Select, { label: 'License', options: OPTIONS, value: 'Apache-2.0' });
    const sel = doc.querySelector<HTMLSelectElement>('select');
    expect(sel?.getAttribute('aria-hidden')).toBe('true');
    expect(sel?.tabIndex).toBe(-1);
    const opts = [...(sel?.options ?? [])];
    expect(opts.map((o) => [o.value, o.text, o.dataset['meta'] ?? null, o.disabled])).toEqual([
      ['', 'All licenses', null, false],
      ['MIT', 'MIT', '12', false],
      ['Apache-2.0', 'Apache-2.0', '3', false],
      ['GPL', 'GPL', null, true],
    ]);
    expect(sel?.value).toBe('Apache-2.0');
    // The closed popup is not server-rendered: select.zag.mjs builds it on start.
    expect(doc.querySelector('[role="listbox"]')).toBeNull();
  });

  it('C-161 disabled, aria-invalid, name and id drive the machine; aria-* go to the trigger, other attributes to the hidden <select>', async () => {
    const doc = await render(Select, {
      label: 'License',
      hideLabel: true,
      options: OPTIONS,
      disabled: true,
      'aria-invalid': 'true',
      name: 'license',
      id: 'lic',
      'data-filter': 'license',
      'aria-describedby': 'hint',
    });
    const label = doc.querySelector('label.ocx-ui-field__label');
    expect(label?.hasAttribute('data-hidden')).toBe(true);
    expect(label?.getAttribute('for')).toBe('lic');
    const trigger = doc.querySelector('button');
    expect(trigger?.hasAttribute('disabled')).toBe(true);
    expect(trigger?.getAttribute('aria-invalid')).toBe('true');
    const sel = doc.querySelector('select');
    expect(sel?.id).toBe('lic');
    expect(sel?.hasAttribute('disabled')).toBe(true);
    expect(sel?.getAttribute('name')).toBe('license');
    expect(sel?.getAttribute('data-filter')).toBe('license');
    expect(trigger?.getAttribute('aria-describedby')).toBe('hint');
    expect(sel?.hasAttribute('aria-describedby')).toBe(false);
  });

  it('C-161 two selects on one page get distinct ids, each label pointing at its own native select', async () => {
    const doc = await render(Select, { label: 'A', options: OPTIONS }, { label: 'B', options: OPTIONS });
    const ids = [...doc.querySelectorAll('select')].map((s) => s.id);
    expect(new Set(ids).size).toBe(2);
    expect([...doc.querySelectorAll('label')].map((l) => l.getAttribute('for'))).toEqual(ids);
  });
});

describe('Select, Combobox and overlay CSS', () => {
  const selectCss = () => rules(overlayCss());

  it('WP14b overlay.css: exists and wraps its whole body in @layer ocx (an imported sheet is neither scoped nor layered)', () => {
    const css = overlayCss();
    expect(css, 'ui/overlay.css missing').not.toBe('');
    const all = rules(css);
    expect(all.length).toBeGreaterThan(0);
    expect(all.filter((r) => !inLayer(r)).map((r) => r.selector)).toEqual([]);
  });

  it('WP14b overlay.css: imported from the frontmatter of Select, Combobox and Menu', () => {
    for (const file of ['Select.astro', 'Combobox.astro', 'Menu.astro']) {
      const front = /^---([\s\S]*?)\n---/.exec(source(file))?.[1] ?? '';
      expect(front, file).toMatch(/import\s+['"]\.\/overlay\.css['"]/);
    }
  });

  it('C-130f every component <style> of Menu and Combobox is wrapped in @layer ocx; Select styles live in overlay.css', () => {
    for (const file of ['Menu.astro', 'Combobox.astro']) {
      const all = rules(styleOf(file));
      expect(all.length, `${file} has no styles`).toBeGreaterThan(0);
      expect(
        all.filter((r) => !inLayer(r)).map((r) => r.selector),
        file,
      ).toEqual([]);
    }
    expect(styleOf('Select.astro')).toBe('');
  });

  it('WP14b Select: __control has the fixed inline-size calc(space-12 * 2 - space-5), so runtime options cause no CLS', () => {
    const hit = selectCss().find(
      (r) =>
        r.selector.split(',').some((s) => s.includes('.ocx-ui-select__control') && !s.includes(':')) &&
        /(^|;|\s)inline-size\s*:\s*calc\(\s*var\(--ocx-space-12\)\s*\*\s*2\s*-\s*var\(--ocx-space-5\)\s*\)/.test(
          r.body,
        ),
    );
    expect(hit, 'no .ocx-ui-select__control rule with the fixed inline-size').toBeDefined();
    expect(hit && inLayer(hit)).toBe(true);
  });

  it('select-chevron: __icon stroke-width is --ocx-icon-stroke and its children use non-scaling-stroke', () => {
    const all = selectCss();
    const icon = all.find((r) => r.selector.trim() === '.ocx-ui-select__icon');
    expect(icon?.body).toMatch(/stroke-width\s*:\s*var\(--ocx-icon-stroke\)/);
    const kids = all.find((r) => r.selector.trim() === '.ocx-ui-select__icon *');
    expect(kids?.body).toMatch(/vector-effect\s*:\s*non-scaling-stroke/);
  });

  it('WP14b overlay.css: --_ov-* are set on :root and .ocx-ui-overlay (every popup surface) reads them', () => {
    const all = rules(overlayCss());
    const root = all
      .filter((r) => r.selector === ':root')
      .map((r) => r.body)
      .join(';');
    for (const v of [...OV_VARS, '--_ov-pad']) expect(root, v).toMatch(new RegExp(`${v}\\s*:`));
    const overlayBodies = all
      .filter((r) => r.selector.split(',').some((s) => s.trim() === '.ocx-ui-overlay'))
      .map((r) => r.body)
      .join(';');
    for (const v of OV_VARS) expect(overlayBodies, `.ocx-ui-overlay reads ${v}`).toContain(`var(${v})`);
  });

  it('D-Z10 Zag-positioned popups (Select, Combobox) use no CSS anchor positioning; the positioner stacks at --ocx-z-popover', () => {
    const css = `${overlayCss()}\n${styleOf('Combobox.astro')}`;
    expect(css).not.toMatch(/position-area|position-anchor|anchor-name/);
    const pos = rules(css).find((r) => r.selector.includes("[data-part='positioner']"));
    expect(pos?.body).toMatch(/--z-index\s*:\s*var\(--ocx-z-popover\)/);
  });

  it("Combobox and TagsInput popups animate on the shared overlay rules: closed follows the list's hidden, live only", () => {
    const css = norm(overlayCss());
    expect(css).toMatch(/\.ocx-ui-overlay:has\(> \[data-part='content'\]\[hidden\]\) \{ opacity: 0;/);
    expect(css).toMatch(/\.ocx-ui-overlay:has\(> \[data-part='content'\]\[hidden\]\) \{ display: none; \}/);
    // The list stays laid out through the exit (no collapse to its siblings); the wrapper's display ends it.
    expect(css).toMatch(/\.ocx-ui-overlay > \[data-part='content'\]\[hidden\] \{[^}]*display: block;/);
    expect(css).toContain("[data-zag-state='live'] .ocx-ui-overlay:has(> [data-part='content']) {");
    expect(css).toContain(":has(> [data-part='content']:not([hidden])) { @starting-style");
    for (const file of ['Combobox.astro', 'TagsInput.astro']) expect(styleOf(file), file).not.toMatch(/__popup:has\(/);
  });

  it('C-130f hidden rows and parts stay hidden despite their display rules', () => {
    const all = rules(`${overlayCss()}\n${styleOf('Combobox.astro')}`);
    for (const part of ['.ocx-ui-option', '.ocx-ui-combobox__empty'])
      expect(
        all.some((r) => r.selector.includes(`${part}[hidden]`) && /display\s*:\s*none/.test(r.body)),
        part,
      ).toBe(true);
    // The clear trigger is a Button: its own [hidden] rule keeps it hidden while there is nothing to clear.
    expect(rules(source('button.css')).some((r) => r.selector.includes('.ocx-ui-button[hidden]'))).toBe(true);
  });

  it('D-Z17 behaviour comes from Zag only: ui/ scripts just mount a *.zag.mjs; no other .mjs besides ids, zag, zag-runtime and choice helpers', () => {
    expect(readdirSync(UI).filter((f) => f.endsWith('.mjs') && !f.endsWith('.zag.mjs'))).toEqual([
      'choice.mjs',
      // CommandBar and CycleButton: native controls plus DOM glue, no Zag machine fits.
      'command-bar.mjs',
      'cycle-button.mjs',
      // DataTable sort/filter/paging has no Zag machine for tables (owner finding).
      'data-table.mjs',
      // Combobox fuzzy match helper is plain logic, not Zag behaviour (owner finding).
      'fuzzy.mjs',
      'ids.mjs',
      'lazy.mjs',
      // C-302 leave(): the WAAPI exit for a node a script removes, not a machine.
      'motion.mjs',
      'number-stepper.mjs',
      // Primitives without a Zag machine: native controls plus a few lines of DOM glue (C-266…C-272).
      'progress-circle.mjs',
      'range.mjs',
      'search-field.mjs',
      'tag-group.mjs',
      'toggle-button.mjs',
      'zag-runtime.mjs',
      'zag.mjs',
    ]);
    for (const file of ['Select.astro', 'Combobox.astro', 'Choice.astro', 'RadioGroup.astro']) {
      const script = /<script>([\s\S]*?)<\/script>/.exec(source(file))?.[1] ?? '';
      expect(script, file).toMatch(/import \{ mount \} from '\.\/zag\.mjs';/);
      expect(script, file).toMatch(/import\('\.\/[\w-]+\.zag\.mjs'\)/);
    }
  });
});

describe('WP14b Menu', () => {
  it('WP14b Menu: .ocx-ui-menu[data-align=start] > Button trigger[popovertarget] + nav.ocx-ui-overlay popover=auto named by the label', async () => {
    const doc = await render(Menu, { label: 'Ecosystem', items: ITEMS, class: 'extra' });
    const root = doc.querySelector('.ocx-ui-menu');
    expect(root?.classList.contains('extra')).toBe(true);
    expect(root?.getAttribute('data-align')).toBe('start');
    const trigger = root?.querySelector('button.ocx-ui-button.ocx-ui-menu__trigger');
    expect(trigger?.getAttribute('type')).toBe('button');
    expect(trigger?.textContent.trim()).toBe('Ecosystem');
    const popup = root?.querySelector('nav.ocx-ui-overlay.ocx-ui-menu__popup');
    expect(popup?.id).toBeTruthy();
    expect(trigger?.getAttribute('popovertarget')).toBe(popup?.id);
    expect(['', 'auto']).toContain(popup?.getAttribute('popover'));
    expect(popup?.getAttribute('aria-label')).toBe('Ecosystem');
  });

  it('WP14b Menu: items are links with aria-current=page on the current one only; disclosure pattern, no role=menu', async () => {
    const doc = await render(Menu, { label: 'Ecosystem', items: ITEMS });
    const links = [...doc.querySelectorAll<HTMLAnchorElement>('.ocx-ui-menu__popup a.ocx-ui-menu__item')];
    expect(links.map((a) => [a.textContent.trim(), a.getAttribute('href')])).toEqual(
      ITEMS.map((i) => [i.label, i.href]),
    );
    expect(links.map((a) => a.getAttribute('aria-current'))).toEqual([null, 'page', null]);
    expect(doc.querySelector('[role="menu"], [role="menuitem"], [role="menubar"]')).toBeNull();
    for (const svg of doc.querySelectorAll('.ocx-ui-menu svg')) expect(svg.getAttribute('aria-hidden')).toBe('true');
  });

  it('WP14b Menu: align=end sets data-align=end; two menus get distinct popups, each trigger targeting its own', async () => {
    const doc = await render(Menu, { label: 'A', items: ITEMS }, { label: 'B', items: ITEMS, align: 'end' });
    const menus = [...doc.querySelectorAll('.ocx-ui-menu')];
    expect(menus.map((m) => m.getAttribute('data-align'))).toEqual(['start', 'end']);
    const pairs = menus.map((m) => [
      m.querySelector('.ocx-ui-menu__trigger')?.getAttribute('popovertarget'),
      m.querySelector('.ocx-ui-menu__popup')?.id,
    ]);
    for (const [target, id] of pairs) expect(target).toBe(id);
    expect(pairs[0]?.[1]).not.toBe(pairs[1]?.[1]);
  });

  it('WP14b Menu: a <script> wires the existing closeOnFocusOut (starlight/menu-focusout.mjs) onto every .ocx-ui-menu__popup', () => {
    const script = /<script>([\s\S]*?)<\/script>/.exec(source('Menu.astro'))?.[1] ?? '';
    expect(script).toMatch(
      /import\s*\{\s*closeOnFocusOut\s*\}\s*from\s*['"]\.\.\/\.\.\/starlight\/menu-focusout\.mjs['"]/,
    );
    expect(script).toContain('.ocx-ui-menu__popup');
  });

  it('WP14b Menu: anchored via position-area (end → span-inline-start)', () => {
    const all = rules(`${styleOf('Menu.astro')}\n${overlayCss()}`);
    const areas = all.filter((r) => /position-area\s*:/.test(r.body)).map((r) => norm(r.body));
    expect(areas.some((b) => /position-area\s*:\s*block-end span-inline-end/.test(b))).toBe(true);
    expect(areas.some((b) => /position-area\s*:\s*block-end span-inline-start/.test(b))).toBe(true);
  });
});

const comboApi = (props: Record<string, unknown>, options: { value: string; label: string }[], query?: string) =>
  ssrApi(combobox.machine, combobox.connect, { ...props, collection: combobox.toCollection(options, query) });

describe('C-162 Combobox (Zag combobox)', () => {
  const props = { label: 'Package', options: OPTIONS.slice(0, 3), value: 'MIT', placeholder: 'Search' };

  it('C-130a C-162 SSR of every part equals connect() for the same props; no data-focus', async () => {
    for (const p of [props, { ...props, query: 'a', highlighted: 'Apache-2.0', open: true, disabled: true }]) {
      const html = await container.renderToString(Combobox, { props: p });
      const doc = new JSDOM(html).window.document;
      const api = comboApi(
        {
          id: zagIdOf(doc, 'combobox'),
          defaultValue: ['MIT'],
          placeholder: 'Search',
          positioning: { strategy: 'fixed' },
          translations: { clearTriggerLabel: 'Clear Package' },
          ...('query' in p && {
            defaultInputValue: 'a',
            defaultOpen: true,
            defaultHighlightedValue: 'Apache-2.0',
            disabled: true,
          }),
        },
        props.options,
        'query' in p ? 'a' : undefined,
      );
      for (const [part, attrs] of Object.entries({
        root: api.getRootProps(),
        label: api.getLabelProps(),
        control: api.getControlProps(),
        input: api.getInputProps(),
        'clear-trigger': api.getClearTriggerProps(),
        positioner: api.getPositionerProps(),
        content: api.getContentProps(),
      })) {
        if (part === 'root') continue; // the root also carries data-zag-*, checked below
        if (part === 'clear-trigger') {
          // A Button: the Zag attributes match connect() exactly, on top of Button's own three.
          const el = new JSDOM(html).window.document.querySelector(`[data-part="${part}"]`);
          const own = new Set(['data-variant', 'data-size', 'data-icon-only']);
          const got = Object.fromEntries(
            [...(el?.attributes ?? [])]
              .filter((a) => a.name !== 'class' && !own.has(a.name))
              .map((a) => [a.name, a.value]),
          );
          expect(got, part).toEqual(domAttrs(attrs));
          continue;
        }
        expectSsrMatchesConnect(html, part, attrs);
      }
      expect(html).not.toMatch(/data-focus/);
    }
  });

  it('C-130b C-106 root: data-zag-root, idle, data-zag-props = the zag passthrough only', async () => {
    const root = (await render(Combobox, { ...props, zag: { loopFocus: false } })).querySelector('.ocx-ui-combobox');
    expect(root?.getAttribute('data-zag-root')).toBe('combobox');
    expect(root?.getAttribute('data-zag-state')).toBe('idle');
    expect(JSON.parse(root?.getAttribute('data-zag-props') ?? '')).toEqual({ loopFocus: false });
  });

  it('C-162 first paint is final: the input shows the committed label; APG attributes; the listbox is named', async () => {
    const doc = await render(Combobox, props);
    const input = doc.querySelector<HTMLInputElement>('input.ocx-ui-input-group__input');
    expect(input?.value).toBe('MIT');
    expect(input?.getAttribute('role')).toBe('combobox');
    expect(input?.getAttribute('aria-autocomplete')).toBe('list');
    expect(input?.getAttribute('aria-expanded')).toBe('false');
    expect(input?.getAttribute('autocomplete')).toBe('off');
    expect(input?.getAttribute('placeholder')).toBe('Search');
    const list = doc.getElementById(input?.getAttribute('aria-controls') ?? '');
    expect(list?.getAttribute('role')).toBe('listbox');
    expect(list?.hasAttribute('hidden')).toBe(true);
    expect(doc.getElementById(list?.getAttribute('aria-labelledby') ?? '')?.textContent.trim()).toBe('Package');
    expect(doc.querySelector(`label[for="${input?.id}"]`)?.textContent.trim()).toBe('Package');
    const opts = [...(list?.querySelectorAll('[role="option"]') ?? [])];
    expect(opts.map((o) => o.getAttribute('data-state'))).toEqual(['unchecked', 'checked', 'unchecked']);
    const clear = doc.querySelector('.ocx-ui-input-group > [data-part="clear-trigger"]');
    expect(clear?.getAttribute('aria-label')).toBe('Clear Package');
    expect(clear?.classList.contains('ocx-ui-button')).toBe(true);
    expect(clear?.getAttribute('data-variant')).toBe('ghost');
    expect(clear?.getAttribute('data-size')).toBe('s');
    expect(clear?.querySelector('svg.ocx-icon')).not.toBeNull();
    expect(clear?.textContent?.trim()).toBe('');
    expect((await render(Combobox, { ...props, value: undefined })).querySelector('input')?.value).toBe('');
    expect((await render(Combobox, { ...props, id: 'pkg' })).querySelector('input')?.id).toBe('pkg');
  });

  it('C-162 query filters the options (case-insensitive), marks the match, and shows the empty text when none match', async () => {
    const doc = await render(Combobox, { ...props, query: 'a', highlighted: 'Apache-2.0' });
    const opts = [...doc.querySelectorAll('[role="option"]')];
    expect(opts.map((o) => o.hasAttribute('hidden'))).toEqual([false, false, false].map((_, i) => i === 1));
    expect(opts[0]?.querySelector('mark')?.textContent).toBe('A');
    expect(opts[2]?.querySelector('mark')?.textContent).toBe('A');
    expect(opts[2]?.hasAttribute('data-highlighted')).toBe(true);
    expect(doc.querySelector('.ocx-ui-combobox__empty')?.hasAttribute('hidden')).toBe(true);
    const none = await render(Combobox, { ...props, query: 'zz', empty: 'nothing' });
    expect([...none.querySelectorAll('[role="option"][hidden]')]).toHaveLength(3);
    const empty = none.querySelector('.ocx-ui-combobox__empty');
    expect(empty?.hasAttribute('hidden')).toBe(false);
    expect(empty?.textContent.trim()).toBe('nothing');
  });

  it('C-162 the popup is a Zag positioner wearing .ocx-ui-overlay, no popover attribute (D-Z10)', async () => {
    const root = (await render(Combobox, { ...props, class: 'extra' })).querySelector('.ocx-ui-combobox');
    expect(root?.classList.contains('extra')).toBe(true);
    for (const part of ['control', 'input', 'clear-trigger', 'positioner', 'content', 'item'])
      expect(root?.querySelector(`[data-part="${part}"]`), part).not.toBeNull();
    expect(root?.querySelector('[data-part="positioner"] > .ocx-ui-overlay')).not.toBeNull();
    expect(root?.querySelector('[popover]')).toBeNull();
  });

  it('C-274 Combobox control is an InputGroup (search icon, Zag input, clear), the label a Label', async () => {
    const root = (await render(Combobox, props)).querySelector('.ocx-ui-combobox');
    const group = root?.querySelector('.ocx-ui-input-group');
    expect(group?.getAttribute('data-part')).toBe('control');
    expect(group?.querySelector(':scope > svg.ocx-icon')).not.toBeNull();
    expect(group?.querySelector(':scope > input.ocx-ui-input-group__input[data-part="input"]')).not.toBeNull();
    expect(root?.querySelector(':scope > label.ocx-ui-field__label[data-part="label"]')).not.toBeNull();
    expect(
      (await render(Combobox, { ...props, hideLabel: true })).querySelector('label')?.hasAttribute('data-hidden'),
    ).toBe(true);
  });

  it('C-274 Combobox and Select load field.css themselves: their label styles do not need an Input on the page', () => {
    for (const file of ['Combobox.astro', 'Select.astro'])
      expect(source(file), file).toMatch(/import '\.\/field\.css'/);
    expect(source('field.css')).toMatch(/\.ocx-ui-field__label\s*\{[^}]*font-weight/);
    expect(overlayCss()).not.toMatch(/ocx-ui-field__label/);
  });

  it('WP14b Combobox: the foot uses <kbd class="ocx-kbd"> and is aria-hidden', async () => {
    const foot = (await render(Combobox, props)).querySelector('.ocx-ui-combobox__foot');
    expect(foot?.getAttribute('aria-hidden')).toBe('true');
    expect(foot?.querySelectorAll('kbd.ocx-kbd').length).toBeGreaterThanOrEqual(4);
  });
});
