// Showcase kit (example-local, examples/starlight/src/components/showcase/): PropsTable (C-121),
// EventLog (C-122), Demo, StateGrid/State. Markup via the Astro Container API, parsed with JSDOM.
import { readFileSync } from 'node:fs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';
import { installEventLogs } from '../../../examples/starlight/src/components/showcase/event-log.mjs';

type Win = Window & typeof globalThis;
type Component = Parameters<AstroContainer['renderToString']>[0];
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: Win } };
const kit = new URL('../../../examples/starlight/src/components/showcase/', import.meta.url);
const load = async (name: string) => ((await import(`${kit.href}${name}.astro`)) as { default: Component }).default;

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});

async function render(name: string, props: Record<string, unknown>, slots?: Record<string, string>) {
  const html = await container.renderToString(await load(name), { props, ...(slots ? { slots } : {}) });
  return new JSDOM(`<body>${html}</body>`).window.document;
}

describe('C-121 PropsTable', () => {
  const rows = [
    { name: 'variant', type: "'primary' | 'ghost'", default: "'secondary'", description: 'Look of the button.' },
    { name: 'label', type: 'string', required: true, description: 'Visible text.' },
    { name: 'title', type: 'string', description: 'Optional, no default.' },
  ];

  it('C-121 renders a captioned table naming the component, one row per prop', async () => {
    const doc = await render('PropsTable', { of: 'ui/Button.astro', rows });
    const table = doc.querySelector('table');
    expect(table?.querySelector('caption')?.textContent).toContain('<Button>');
    expect([...doc.querySelectorAll('thead th')].map((th) => th.textContent?.trim())).toEqual([
      'Prop',
      'Type',
      'Default',
      'Description',
    ]);
    for (const th of doc.querySelectorAll('th')) expect(th.getAttribute('scope')).toMatch(/^(col|row)$/);
    const body = [...doc.querySelectorAll('tbody tr')];
    expect(body.map((tr) => tr.querySelector('th')?.textContent?.trim())).toEqual(['variant', 'label', 'title']);
    expect(body[0]?.textContent).toContain("'secondary'");
  });

  it('C-121 a required prop says so; an optional one without a default shows a dash', async () => {
    const doc = await render('PropsTable', { of: 'ui/Button.astro', rows });
    expect(doc.querySelectorAll('tbody tr')[1]?.textContent).toMatch(/required/);
    expect(doc.querySelectorAll('tbody tr')[2]?.textContent).not.toMatch(/required/);
  });

  it('C-121 a component without props says so instead of an empty table', async () => {
    const doc = await render('PropsTable', { of: 'TreeDescription.astro', rows: [] });
    expect(doc.querySelector('table')).toBeNull();
    expect(doc.body.textContent).toMatch(/no props/i);
  });
});

describe('C-122 EventLog', () => {
  it('C-122 renders an empty, labelled log bound to its target', async () => {
    const doc = await render('EventLog', { for: '#tabs-demo' });
    const log = doc.querySelector('[data-showcase-log]');
    expect(log?.getAttribute('data-showcase-log')).toBe('#tabs-demo');
    const region = log?.querySelector('[role="log"]');
    expect(region?.getAttribute('aria-label')).toBe('Events from the demo');
    expect(region?.getAttribute('tabindex')).toBe('0');
    expect(region?.querySelector('ol')?.children.length).toBe(0);
  });

  const page = () => {
    const { window } = new JSDOM(`<body>
      <div id="demo"><button id="inside"></button></div><button id="outside"></button>
      <div data-showcase-log="#demo"><div role="log"><ol></ol></div></div></body>`);
    return window;
  };

  it('C-122 each ocx:* event dispatched inside the target shows its name and detail, newest first', () => {
    const win = page();
    installEventLogs(win.document);
    const inside = win.document.getElementById('inside');
    inside?.dispatchEvent(new win.CustomEvent('ocx:tabs:change', { detail: { value: 'b' }, bubbles: true }));
    inside?.dispatchEvent(new win.CustomEvent('ocx:tabs:change', { detail: { value: 'c' }, bubbles: true }));
    const items = [...win.document.querySelectorAll('[role="log"] li')].map((li) => li.textContent);
    expect(items).toHaveLength(2);
    expect(items[0]).toContain('ocx:tabs:change');
    expect(items[0]).toContain('{"value":"c"}');
    expect(items[1]).toContain('{"value":"b"}');
    expect(win.document.querySelector('[data-showcase-log]')?.hasAttribute('data-has-events')).toBe(true);
  });

  it('C-122 events outside the target, and non-ocx events, are not logged; install is idempotent', () => {
    const win = page();
    installEventLogs(win.document);
    installEventLogs(win.document);
    win.document.getElementById('outside')?.dispatchEvent(new win.CustomEvent('ocx:tabs:change', { bubbles: true }));
    win.document.getElementById('inside')?.dispatchEvent(new win.Event('click', { bubbles: true }));
    expect(win.document.querySelectorAll('[role="log"] li')).toHaveLength(0);
    win.document.getElementById('inside')?.dispatchEvent(new win.CustomEvent('ocx:x:y', { bubbles: true }));
    expect(win.document.querySelectorAll('[role="log"] li')).toHaveLength(1);
  });

  it('C-122 the runtime ships only with the EventLog component (no cost elsewhere)', () => {
    const src = readFileSync(new URL('EventLog.astro', kit), 'utf8');
    expect(src).toMatch(/<script[^>]*>[\s\S]*installEventLogs\(document\)[\s\S]*<\/script>/);
  });
});

describe('Demo, StateGrid, State', () => {
  it('Demo frames its slot and places the log slot beside it', async () => {
    const doc = await render('Demo', { id: 'd1' }, { default: '<button>live</button>', log: '<p>log</p>' });
    const demo = doc.getElementById('d1');
    expect(demo?.querySelector('button')?.textContent).toBe('live');
    expect(demo?.hasAttribute('data-has-log')).toBe(true);
    expect(demo?.textContent).toContain('log');
  });

  it('State labels its cell; StateGrid holds the cells', async () => {
    const doc = await render('State', { label: 'disabled' }, { default: '<button disabled>x</button>' });
    expect(doc.body.textContent).toContain('disabled');
    expect(doc.querySelector('button[disabled]')).not.toBeNull();
    const grid = await render('StateGrid', { wide: true }, { default: '<div>cell</div>' });
    expect(grid.querySelector('[data-wide]')?.textContent).toContain('cell');
  });

  it('kit styles: one showcase.css in @layer ocx on --ocx-* tokens, loaded as the example customCss', () => {
    const css = readFileSync(new URL('showcase.css', kit), 'utf8');
    expect(css).toMatch(/^@layer ocx \{/m);
    expect(css).toMatch(/var\(--ocx-/);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i);
    const config = readFileSync(new URL('../../../examples/starlight/astro.config.mjs', import.meta.url), 'utf8');
    expect(config).toMatch(/customCss: \['\.\/src\/components\/showcase\/showcase\.css'\]/);
  });

  it.each(['PropsTable', 'EventLog', 'Demo', 'StateGrid', 'State', 'ComponentIndex'])(
    '%s carries no inline <style> (inlined per page it would grow every showcase document)',
    (name) => {
      expect(readFileSync(new URL(`${name}.astro`, kit), 'utf8')).not.toMatch(/<style/);
    },
  );
});
