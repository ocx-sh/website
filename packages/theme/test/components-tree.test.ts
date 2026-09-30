// WP13.3 Tree / Node / Description: markup contract of the port of ocx Tree.vue + FileTreeNode.vue.
// Composition mirrors MDX: child Nodes are rendered first and passed as the parent's default slot,
// <Description> as the named `description` slot (authoring form documented in TreeNode.astro).
//
// Markup contract (selectors the e2e spec shares):
//   .ocx-tree                    Tree root; li.ocx-tree__node per Node
//   .ocx-tree__row               the row: <summary> of li > details for a directory, else a plain element
//   .ocx-tree__name / __desc     name and muted description, both inside the row
//   .ocx-tree__chevron           a directory's rotating chevron (svg); an empty spacer on a file row
//   .ocx-tree__icon              aria-hidden icon; a directory with two icons holds .ocx-tree__icon-closed + -open
//   ul.ocx-tree__children        a directory's child Nodes, inside its <details>
//   [data-selected]              the one selected row per tree (tree.mjs `select`), with aria-current
//   [data-selectable]            opt-in selection: on .ocx-tree ("true"/"false"), a row's own wins
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';
import { ICONS } from '../src/icons/icons.mjs';
import { CHEVRON, clear, iconsFor, isSelectable, select } from '../src/components/tree.mjs';

type Component = Parameters<AstroContainer['renderToString']>[0];
type Win = Window & typeof globalThis;
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: Win } };
const load = async (name: string): Promise<Component> =>
  ((await import(`../src/components/${name}.astro`)) as { default: Component }).default;

let container: AstroContainer;
let Tree: Component, TreeNode: Component, TreeDescription: Component;

beforeAll(async () => {
  container = await AstroContainer.create();
  [Tree, TreeNode, TreeDescription] = [await load('Tree'), await load('TreeNode'), await load('TreeDescription')];
});

type NodeProps = Record<string, unknown> & { name: string };
/** Render a Node to HTML: `children` = already-rendered child Nodes, `desc` = Description body. */
async function node(props: NodeProps, children?: string, desc?: string): Promise<string> {
  const slots: Record<string, string> = {};
  if (children !== undefined) slots['default'] = children;
  if (desc !== undefined)
    slots['description'] = await container.renderToString(TreeDescription, { slots: { default: desc } });
  return container.renderToString(TreeNode, { props, slots });
}
async function tree(nodes: string, props: Record<string, unknown> = {}): Promise<Document> {
  const html = await container.renderToString(Tree, { props, slots: { default: nodes } });
  return new JSDOM(html).window.document;
}
const file = (name: string, props: Record<string, unknown> = {}) => node({ name, ...props });
const dir = async (name: string, props: Record<string, unknown> = {}) => node({ name, ...props }, await file('x'));

/** The top-level Node's own li / row. */
const li = (d: Document) => d.querySelector<HTMLLIElement>('.ocx-tree li.ocx-tree__node')!;
const row = (d: Document) => li(d).querySelector<HTMLElement>('.ocx-tree__row')!;
const isDir = (d: Document) => li(d).querySelector(':scope > details > summary.ocx-tree__row') !== null;
const icon = (r: Element, which: 'closed' | 'open') => {
  const i = r.querySelector('.ocx-tree__icon')!;
  return (i.querySelector(`.ocx-tree__icon-${which}`) ?? i).textContent.trim();
};

describe('WP13.3 Tree: default icon table (FileTreeNode.vue DEFAULT_ICONS)', () => {
  const table: [name: string, kind: 'file' | 'dir', closed: string, open: string][] = [
    ['metadata.json', 'file', '📋', '📋'],
    ['manifest.json', 'file', '📋', '📋'],
    ['bin/', 'dir', '⚙️', '⚙️'],
    ['lib/', 'dir', '📚', '📚'],
    ['share/', 'dir', '📁', '📁'],
    ['content/', 'dir', '📂', '📂'],
    ['entrypoints/', 'dir', '🚀', '🚀'],
    ['src/', 'dir', '📁', '📂'],
    ['README.md', 'file', '📄', '📄'],
  ];
  for (const [name, kind, closed, open] of table) {
    it(`WP13.3 Tree: ${kind} "${name}" gets ${closed}${kind === 'dir' ? ` / ${open} open` : ''} (dbcc8d595)`, async () => {
      const d = await tree(kind === 'dir' ? await dir(name) : await file(name));
      expect(icon(row(d), 'closed')).toBe(closed);
      if (kind === 'dir') expect(icon(row(d), 'open')).toBe(open);
    });
  }

  it('WP13.3 Tree: table keys match exact names only — "bin" without slash is a plain 📄 file (dbcc8d595)', async () => {
    expect(icon(row(await tree(await file('bin'))), 'closed')).toBe('📄');
  });

  it('WP13.3 Tree: the table applies to a childless "content/" row too (storage.md symlinks tree)', async () => {
    expect(icon(row(await tree(await file('content/'))), 'closed')).toBe('📂');
  });
});

describe('WP13.3 Tree: explicit icons', () => {
  it('WP13.3 Tree: explicit icon wins over the default table (Node.vue icon)', async () => {
    expect(icon(row(await tree(await file('metadata.json', { icon: '🧾' }))), 'closed')).toBe('🧾');
  });

  it('WP13.3 Tree: open-icon (kebab, storage.md) is the expanded icon', async () => {
    const r = row(await tree(await dir('{registry}/', { icon: '📁', 'open-icon': '🗃️' })));
    expect([icon(r, 'closed'), icon(r, 'open')]).toEqual(['📁', '🗃️']);
  });

  it('WP13.3 Tree: openIcon (camelCase) is the expanded icon (Node.vue openIcon)', async () => {
    const r = row(await tree(await dir('{registry}/', { icon: '📁', openIcon: '🗃️' })));
    expect([icon(r, 'closed'), icon(r, 'open')]).toEqual(['📁', '🗃️']);
  });

  // Owner finding 2026-09-28: 🏠 → 📂 swapped to an unrelated icon; the chevron shows the state now.
  it('WP13.3 Tree: an explicit icon stays put when its directory opens (no unrelated 📂 swap)', async () => {
    const r = row(await tree(await dir('~/.ocx/', { icon: '🏠', open: true })));
    expect([icon(r, 'closed'), icon(r, 'open')]).toEqual(['🏠', '🏠']);
  });

  it('WP13.3 Tree: iconsFor is the one rule of Tree and TreeView', () => {
    expect(iconsFor('src/', true)).toEqual(['📁', '📂']);
    expect(iconsFor('src/', false)).toEqual(['📄', '📄']);
    expect(iconsFor('x', true, '🏠')).toEqual(['🏠', '🏠']);
    expect(iconsFor('x', true, '📁', '🗃️')).toEqual(['📁', '🗃️']);
    expect(iconsFor('bin/', true)).toEqual(['⚙️', '⚙️']);
  });

  it('WP13.3 Tree: every directory row has one chevron svg; a file row an empty spacer', async () => {
    const d = await tree(await node({ name: 'a/' }, (await file('b')) + (await dir('c/'))));
    const dirs = [...d.querySelectorAll('summary.ocx-tree__row')];
    expect(dirs.length).toBe(2);
    for (const r of dirs) expect(r.querySelectorAll(':scope > .ocx-tree__chevron > svg').length).toBe(1);
    const fileRows = [...d.querySelectorAll('div.ocx-tree__row')];
    for (const r of fileRows) expect(r.querySelector(':scope > .ocx-tree__chevron')?.innerHTML).toBe('');
  });

  it('WP13.3 Tree: a table directory with an explicit icon keeps it when open (table has no openIcon)', async () => {
    const r = row(await tree(await dir('bin/', { icon: '🔧' })));
    expect([icon(r, 'closed'), icon(r, 'open')]).toEqual(['🔧', '🔧']);
  });

  it('WP13.3 Tree: icons are decorative (aria-hidden) and replace the ▾/▸ toggle entirely (dbcc8d595)', async () => {
    const d = await tree(await node({ name: 'a/' }, (await file('b')) + (await dir('c/'))));
    const icons = [...d.querySelectorAll('.ocx-tree__icon')];
    expect(icons.length).toBe(d.querySelectorAll('.ocx-tree__row').length);
    for (const i of icons) expect(i.getAttribute('aria-hidden')).toBe('true');
    expect(d.body.textContent).not.toMatch(/[▾▸]/);
  });
});

describe('WP13.3 Tree: directory detection', () => {
  it('WP13.3 Tree: a Node with child Nodes is a <details>/<summary> directory', async () => {
    const d = await tree(await dir('state/'));
    expect(isDir(d)).toBe(true);
    expect(li(d).querySelector(':scope > details > ul.ocx-tree__children > li.ocx-tree__node')).not.toBeNull();
  });

  it('WP13.3 Tree: a trailing "/" with only a Description is a file row (storage.md packages/)', async () => {
    const d = await tree(await node({ name: 'packages/', icon: '📦' }, undefined, 'immutable packages'));
    expect(isDir(d)).toBe(false);
    expect(d.querySelector('details, summary')).toBeNull();
    expect(icon(row(d), 'closed')).toBe('📦');
  });

  it('WP13.3 Tree: a whitespace-only default slot is still a file row (MDX indentation)', async () => {
    const d = await tree(await node({ name: 'a' }, '\n    \n'));
    expect(isDir(d)).toBe(false);
    expect(icon(row(d), 'closed')).toBe('📄');
  });
});

describe('WP13.3 Tree: open defaults', () => {
  const openOf = async (props: Record<string, unknown>) =>
    li(await tree(await dir('d/', props)))
      .querySelector(':scope > details')!
      .hasAttribute('open');

  it('WP13.3 Tree: a directory is expanded by default (FileTreeNode.vue open !== false)', async () => {
    expect(await openOf({})).toBe(true);
  });
  it('WP13.3 Tree: bare `open` / open="true" expand', async () => {
    expect([await openOf({ open: true }), await openOf({ open: 'true' })]).toEqual([true, true]);
  });
  it('WP13.3 Tree: open={false} collapses', async () => {
    expect(await openOf({ open: false })).toBe(false);
  });
  it('WP13.3 Tree: open="false" (string) collapses (Tree.vue p.open !== "false")', async () => {
    expect(await openOf({ open: 'false' })).toBe(false);
  });
});

describe('WP13.3 Tree: description column', () => {
  it('WP13.3 Tree: <Description slot="description"> renders inside its own row', async () => {
    const d = await tree(await node({ name: 'state/' }, await file('projects/'), 'persistent runtime state'));
    const desc = row(d).querySelector('.ocx-tree__desc');
    expect(desc?.textContent.trim()).toBe('persistent runtime state');
    expect(d.querySelectorAll('.ocx-tree__desc').length).toBe(1);
    expect(d.querySelector('.ocx-tree__children .ocx-tree__desc')).toBeNull();
  });

  it('WP13.3 Tree: the description follows the name in the row (ft-name then ft-desc)', async () => {
    const d = await tree(await node({ name: 'a' }, undefined, 'text'));
    const name = row(d).querySelector('.ocx-tree__name')!;
    const desc = row(d).querySelector('.ocx-tree__desc')!;
    expect(name.textContent).toBe('a');
    expect(name.compareDocumentPosition(desc) & 4 /* FOLLOWING */).toBeTruthy();
  });

  it('WP13.3 Tree: inline <code> in a Description survives (Tree.vue flattened it to text)', async () => {
    const d = await tree(
      await node({ name: 'c/index.json' }, undefined, 'catalog — <code>ns/pkg → sha256(root)</code>'),
    );
    expect(row(d).querySelector('.ocx-tree__desc code')?.textContent).toBe('ns/pkg → sha256(root)');
  });

  it('WP13.3 Tree: the `description` prop renders in the row (Node.vue description)', async () => {
    const d = await tree(await file('a', { description: 'plain text' }));
    expect(row(d).querySelector('.ocx-tree__desc')?.textContent.trim()).toBe('plain text');
  });

  it('WP13.3 Tree: the Description slot wins over the `description` prop', async () => {
    const d = await tree(await node({ name: 'a', description: 'prop' }, undefined, 'slot'));
    expect(row(d).querySelector('.ocx-tree__desc')?.textContent.trim()).toBe('slot');
  });

  it('WP13.3 Tree: no description, no empty description element', async () => {
    const d = await tree(await file('a'));
    expect(icon(row(d), 'closed')).toBe('📄');
    expect(d.querySelector('.ocx-tree__desc')).toBeNull();
  });
});

describe('WP13.3 Tree: collapsible', () => {
  it('WP13.3 Tree: collapsible={false} keeps every directory expanded, even open={false} (FileTreeNode.vue)', async () => {
    const inner = await dir('inner/', { open: false });
    const d = await tree(await node({ name: 'outer/', open: 'false' }, inner), { collapsible: false });
    expect(d.querySelectorAll('.ocx-tree__children .ocx-tree__children > li.ocx-tree__node').length).toBe(1);
    expect(d.querySelectorAll('details:not([open])').length).toBe(0);
  });

  it('WP13.3 Tree: collapsible defaults to true (Tree.vue withDefaults)', async () => {
    const d = await tree(await dir('d/', { open: false }));
    expect(d.querySelectorAll('details:not([open])').length).toBe(1);
  });
});

describe('WP13.3 Tree: selectable is opt-in (owner finding 2026-09-28)', () => {
  it('WP13.3 Tree: a tree is not selectable by default; selectable={true} opts in', async () => {
    const off = await tree(await file('a'));
    const on = await tree(await file('a'), { selectable: true });
    expect(off.querySelector('.ocx-tree')?.getAttribute('data-selectable')).toBe('false');
    expect(isSelectable(off.querySelector('.ocx-tree')!, row(off))).toBe(false);
    expect(isSelectable(on.querySelector('.ocx-tree')!, row(on))).toBe(true);
  });

  it("WP13.3 Tree: a Node's own selectable wins over the tree's, both ways", async () => {
    const out = await tree(await dir('d/', { selectable: false }), { selectable: true });
    const inn = await tree(await file('f', { selectable: true }));
    expect(row(out).getAttribute('data-selectable')).toBe('false');
    expect(isSelectable(out.querySelector('.ocx-tree')!, row(out))).toBe(false);
    expect(isSelectable(inn.querySelector('.ocx-tree')!, row(inn))).toBe(true);
    expect(row(await tree(await file('g'))).hasAttribute('data-selectable')).toBe(false);
  });
});

describe('tree.mjs CHEVRON', () => {
  it('draws the registry chevron-right in currentColor at the icon-stroke token', () => {
    expect(CHEVRON).toContain(
      ICONS['chevron-right'].body.replace('<path ', '<path vector-effect="non-scaling-stroke" '),
    );
    expect(CHEVRON).toContain('stroke="currentColor"');
    expect(CHEVRON).toContain('var(--ocx-icon-stroke)');
    expect(CHEVRON).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(/i);
  });
});

describe('WP13.3 Tree: selection (tree.mjs)', () => {
  const dom = () => {
    const d = new JSDOM(
      '<div class="ocx-tree" id="t1"><div class="ocx-tree__row" id="a"></div><div class="ocx-tree__row" id="b"></div></div>' +
        '<div class="ocx-tree" id="t2"><div class="ocx-tree__row" id="c"></div></div>',
    ).window.document;
    const $ = (id: string) => d.getElementById(id)!;
    return { $, selected: () => [...d.querySelectorAll('[data-selected]')].map((e) => e.id) };
  };

  it('WP13.3 Tree: clicking a row selects it; another row moves the single selection (FileTree.vue ft-select)', () => {
    const { $, selected } = dom();
    select($('t1'), $('a'));
    expect(selected()).toEqual(['a']);
    select($('t1'), $('b'));
    expect(selected()).toEqual(['b']);
  });

  it('WP13.3 Tree: selecting the selected row again deselects it (FileTree.vue ft-select)', () => {
    const { $, selected } = dom();
    select($('t1'), $('a'));
    select($('t1'), $('a'));
    expect(selected()).toEqual([]);
  });

  it('WP13.3 Tree: the selected row carries aria-current; clear (Escape) drops it', () => {
    const { $, selected } = dom();
    select($('t1'), $('a'));
    expect($('a').getAttribute('aria-current')).toBe('true');
    clear($('t1'));
    expect(selected()).toEqual([]);
    expect($('a').hasAttribute('aria-current')).toBe(false);
  });

  it('WP13.3 Tree: selection is per tree — another tree keeps its own (one FileTree = one provide)', () => {
    const { $, selected } = dom();
    select($('t1'), $('a'));
    select($('t2'), $('c'));
    expect(selected()).toEqual(['a', 'c']);
  });
});
