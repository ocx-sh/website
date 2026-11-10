// KeyValueTable: header rows, key/value rows with highlight and note, a footer; a key renders as plain text.
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';

type Component = Parameters<AstroContainer['renderToString']>[0];
const KeyValueTable = ((await import(`../src/components/${'KeyValueTable'}.astro`)) as { default: Component }).default;
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: { document: Document } } };

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});
const render = async (props: Record<string, unknown>) =>
  new JSDOM(await container.renderToString(KeyValueTable, { props })).window.document;

const rows = [
  { key: 'linux/amd64', value: '→ sha256:1a31…c2c3', highlight: true, note: '← CI runner' },
  { key: 'windows/amd64', value: '→ sha256:c41a…5ecb' },
];

describe('KeyValueTable', () => {
  it('is a named table: full-width header rows, key and value rows, a footer row', async () => {
    const doc = await render({ label: 'Lock', headers: ['ocx.toml', 'ocx.lock'], rows, footer: 'digests stay put' });
    expect(doc.querySelector('table')?.getAttribute('aria-label')).toBe('Lock');
    const heads = [...doc.querySelectorAll('thead th')];
    expect(heads.map((h) => [h.textContent?.trim(), h.getAttribute('colspan')])).toEqual([
      ['ocx.toml', '2'],
      ['ocx.lock', '2'],
    ]);
    expect([...doc.querySelectorAll('tbody tr')].map((r) => r.querySelector('th')?.textContent)).toEqual([
      'linux/amd64',
      'windows/amd64',
    ]);
    expect(doc.querySelector('tfoot td')?.getAttribute('colspan')).toBe('2');
    expect(doc.querySelector('tfoot td')?.textContent).toBe('digests stay put');
  });

  it('marks the highlighted row only, and puts the note after the value', async () => {
    const doc = await render({ label: 'Lock', rows });
    const [a, b] = [...doc.querySelectorAll('tbody tr')];
    expect(a?.hasAttribute('data-highlight')).toBe(true);
    expect(b?.hasAttribute('data-highlight')).toBe(false);
    expect(a?.querySelector('td')?.textContent?.trim()).toBe('→ sha256:1a31…c2c3 ← CI runner');
    expect(a?.querySelector('td .ocx-kv__note')?.textContent?.trim()).toBe('← CI runner');
    expect(b?.querySelector('.ocx-kv__note')).toBeNull();
  });

  it('renders a key as plain text, with no break opportunities of its own', async () => {
    const doc = await render({ label: 'Lock', rows: [{ key: 'a/b/c.d', value: 'x' }] });
    const th = doc.querySelector('tbody th')!;
    expect(th.querySelectorAll('wbr')).toHaveLength(0);
    expect(th.textContent?.trim()).toBe('a/b/c.d');
  });

  it('has no head or foot without headers or footer', async () => {
    const doc = await render({ label: 'Lock', rows });
    expect(doc.querySelector('thead')).toBeNull();
    expect(doc.querySelector('tfoot')).toBeNull();
  });
});
