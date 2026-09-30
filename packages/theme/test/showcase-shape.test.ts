// C-120 (component index) and C-121 (page shape: stories/props headings, PropsTable rows
// equal the component's declared Props) over the example showcase, plus planted failures.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { componentPages } from '../../../examples/starlight/src/components/showcase/pages.mjs';
import { COMPONENT_EXEMPT } from './component-inventory.mjs';
import { checkShape, extractProps, headingIds, isZagBacked, pageImports, propsTables, rootClass } from './showcase.mjs';

const themeRoot = new URL('..', import.meta.url).pathname;
const componentsDir = join(themeRoot, 'src/components');
const docsDir = join(themeRoot, '../../examples/starlight/src/content/docs/components');
const kitDir = join(themeRoot, '../../examples/starlight/src/components/showcase');
const storiesDir = join(themeRoot, '../../examples/starlight/src/stories');
const EXEMPT = Object.keys(COMPONENT_EXEMPT);

const astroFiles = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.astro'));
const components = Object.fromEntries(
  astroFiles(componentsDir).map((f) => [f.split('\\').join('/'), readFileSync(join(componentsDir, f), 'utf8')]),
);
const modules = Object.fromEntries(
  readdirSync(componentsDir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.mjs'))
    .map((f) => [f.split('\\').join('/'), readFileSync(join(componentsDir, f), 'utf8')]),
);
const pages = Object.fromEntries(
  readdirSync(docsDir, { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.mdx?$/.test(f))
    .map((f) => [
      f
        .split('\\')
        .join('/')
        .replace(/\.mdx?$/, ''),
      readFileSync(join(docsDir, f), 'utf8'),
    ]),
);

// C-125: slug → the sources of src/stories/<slug>/*.mdx.
const stories: Record<string, string[]> = {};
for (const f of readdirSync(storiesDir, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.mdx'))) {
  const rel = f.split('\\').join('/');
  (stories[rel.slice(0, rel.lastIndexOf('/'))] ??= []).push(readFileSync(join(storiesDir, f), 'utf8'));
}

describe('C-121 extractProps reads the declared Props members', () => {
  it('C-121 interface Props: every member, including quoted keys', () => {
    const src = `---\ninterface Props {\n  name: string;\n  'open-icon'?: string;\n  open?: boolean | 'true';\n}\n---\n<li />`;
    expect(extractProps(src)).toEqual(['name', 'open-icon', 'open']);
  });

  it('C-121 interface Props extends HTML attributes: members plus one rest row', () => {
    const src = `---\nimport type { HTMLAttributes } from 'astro/types';\nexport interface Props extends Omit<HTMLAttributes<'input'>, 'type'> {\n  type?: 'checkbox';\n  label: string;\n}\n---`;
    expect(extractProps(src)).toEqual(['type', 'label', 'rest → <input>']);
  });

  it('C-121 type Props = union of intersections over local types: every member once, one rest row naming each element', () => {
    const src = `---
import type { HTMLAttributes } from 'astro/types';
interface Common { variant?: 'a'; size?: 's'; }
type IconOnly = { iconOnly: true; 'aria-label': string } | { iconOnly?: false };
type AsButton = Common & IconOnly & Omit<HTMLAttributes<'button'>, 'type'> & { href?: undefined; type?: 'button' };
type AsLink = Common & IconOnly & HTMLAttributes<'a'> & { href: string };
export type Props = AsButton | AsLink;
---`;
    expect(extractProps(src)).toEqual([
      'variant',
      'size',
      'iconOnly',
      'aria-label',
      'href',
      'type',
      'rest → <button> | <a>',
    ]);
  });

  it('C-121 Omit over a local type drops the omitted keys', () => {
    const src = `---\ninterface Base { a: string; b?: number; c?: boolean }\ntype Props = Omit<Base, 'b'> & { d: string };\n---`;
    expect(extractProps(src)).toEqual(['a', 'c', 'd']);
  });

  it('C-121 a Props type the reader cannot resolve throws instead of yielding no rows', () => {
    for (const body of [
      "import type { Base } from './base';\ninterface Props extends Base { a: string }",
      "interface B { a: string }\ntype Props = Pick<B, 'a'>;",
      'type Props = astroHTML.JSX.HTMLAttributes & { a: string };',
      'type Props = { a: string }[keyof X];',
    ])
      expect(() => extractProps(`---\n${body}\n---`), body).toThrow(/Props: cannot read|HTMLAttributes/);
  });

  it('C-121 a component without Props has no rows; other interfaces are ignored', () => {
    expect(extractProps('---\n// renders its slot\n---\n<slot />')).toEqual([]);
    expect(extractProps('---\ninterface Glyph { label: string }\n---')).toEqual([]);
  });

  it('C-121 the real Button yields its union members and both passthrough elements', () => {
    expect(extractProps(components['ui/Button.astro'] ?? '')).toEqual([
      'variant',
      'size',
      'iconOnly',
      'aria-label',
      'href',
      'type',
      'rest → <button> | <a>',
    ]);
  });
});

describe('C-121 page readers', () => {
  const page = `---
title: X
---
import Button from '@ocx-sh/theme/components/ui/Button.astro';
import { Aside } from '@astrojs/starlight/components';
import PropsTable from '../../../components/showcase/PropsTable.astro';

## Demo

\`\`\`mdx
## Not a heading
<PropsTable of="ui/Fake.astro" rows={[{ name: 'x' }]} />
\`\`\`

### Keyboard & focus

## Props

<PropsTable
  of="ui/Button.astro"
  rows={[
    { name: 'variant', type: "'primary' | 'ghost'", default: "'secondary'", description: 'Look {braces} and "quotes".' },
    { name: 'rest → <button> | <a>', type: 'HTMLAttributes', description: \`Passed through.\` },
  ]}
/>
`;

  it('C-121 pageImports maps local names to theme specifiers only', () => {
    expect([...pageImports(page)]).toEqual([['Button', 'ui/Button.astro']]);
  });

  it('C-121 headingIds slugs headings outside code fences', () => {
    expect(headingIds(page)).toEqual(['demo', 'keyboard--focus', 'props']);
  });

  it('C-121 content between two fenced blocks is kept (a fence after a blank line)', () => {
    const src = 'intro\n\n```js\na\n```\n## Keep\n\n```js\nb\n\n```\ntail';
    expect(headingIds(src)).toEqual(['keep']);
  });

  it("C-121 a PropsTable without rows never borrows the next table's rows", () => {
    const src = `<PropsTable of="A.astro" />\n<PropsTable of="B.astro" rows={[{ name: 'x' }]} />`;
    expect(propsTables(src)).toEqual([
      { of: 'A.astro', names: [] },
      { of: 'B.astro', names: ['x'] },
    ]);
  });

  it('C-121 propsTables reads `of` and each row name, skipping code fences', () => {
    expect(propsTables(page)).toEqual([{ of: 'ui/Button.astro', names: ['variant', 'rest → <button> | <a>'] }]);
  });

  it('C-121 isZagBacked and rootClass read the component template', () => {
    expect(isZagBacked('---\n---\n<div data-zag-root="tabs" />')).toBe(true);
    expect(isZagBacked(components['ui/Tag.astro'] ?? '')).toBe(false);
    // A selector string in a script is no root (DataTable queries its Pagination child's root).
    expect(isZagBacked('---\n---\n<div />\n<script>q(\'[data-zag-root="x"]\');</script>')).toBe(false);
    expect(isZagBacked(components['ui/DataTable.astro'] ?? '')).toBe(false);
    // Roots mounted at runtime by an imported module count (the DependencyExplorer's rows).
    const runtime = `---\n---\n<div />\n<script>void import('./rows.mjs');</script>`;
    expect(isZagBacked(runtime, (spec) => (spec === './rows.mjs' ? 'mount(tr, spec)' : undefined))).toBe(true);
    expect(isZagBacked(runtime, () => 'export const x = 1;')).toBe(false);
    expect(isZagBacked(components['DependencyExplorer.astro'] ?? '', (spec) => modules[spec.slice(2)])).toBe(true);
    expect(rootClass(components['ui/Tag.astro'] ?? '')).toBe('ocx-ui-tag');
    expect(rootClass(components['Tree.astro'] ?? '')).toBe('ocx-tree');
    expect(rootClass(components['TreeDescription.astro'] ?? '')).toBeUndefined();
  });
});

describe('C-121 checkShape (planted failures)', () => {
  const Foo = `---\ninterface Props { a: string; b?: number }\n---\n<div class="ocx-foo" />`;
  const Zag = `---\ninterface Props { value?: string }\n---\n<div class="ocx-zag" data-zag-root="tabs" />`;
  // C-125: the page renders stories; the story imports and renders the component.
  const stories = { foo: [`import Foo from '@ocx-sh/theme/components/Foo.astro';\n<Foo />\n`] };
  const good = (extra = '') => `import Stories from '../Stories.astro';

## Stories
<Stories of="foo" />
## Props
<PropsTable of="Foo.astro" rows={[{ name: 'a', type: 'string', description: '' }, { name: 'b', type: 'number', description: '' }]} />
${extra}`;

  it('C-121 a complete page passes', () => {
    expect(checkShape({ components: { 'Foo.astro': Foo }, stories, pages: { foo: good() }, exempt: [] })).toEqual([]);
  });

  it('S-101 an exported component with no page fails naming it; an exempt one does not', () => {
    const problems = checkShape({
      components: { 'Foo.astro': Foo, 'ui/Bar.astro': Foo },
      stories,
      pages: { foo: good() },
      exempt: [],
    });
    expect(problems.join('\n')).toContain('ui/Bar.astro');
    expect(
      checkShape({
        components: { 'Foo.astro': Foo, 'ui/Bar.astro': Foo },
        stories,
        pages: { foo: good() },
        exempt: ['ui/Bar.astro'],
      }),
    ).toEqual([]);
  });

  it('S-101 an undocumented prop fails naming component and prop', () => {
    const page = good().replace(", { name: 'b', type: 'number', description: '' }", '');
    const problems = checkShape({ components: { 'Foo.astro': Foo }, stories, pages: { foo: page }, exempt: [] }).join(
      '\n',
    );
    expect(problems).toContain('Foo.astro');
    expect(problems).toMatch(/\bb\b/);
  });

  it('C-121 a stale row (not a declared prop) fails', () => {
    const page = good().replace("{ name: 'a',", "{ name: 'gone', type: '', description: '' }, { name: 'a',");
    expect(
      checkShape({ components: { 'Foo.astro': Foo }, stories, pages: { foo: page }, exempt: [] }).join('\n'),
    ).toContain('gone');
  });

  it('C-121 a missing PropsTable, or one for a component the page does not import, fails', () => {
    const noTable = good().replace(/<PropsTable[\s\S]*\/>/, '');
    expect(
      checkShape({ components: { 'Foo.astro': Foo }, stories, pages: { foo: noTable }, exempt: [] }).join('\n'),
    ).toContain('Foo.astro');
    const extra = good(`<PropsTable of="Other.astro" rows={[]} />`);
    expect(
      checkShape({ components: { 'Foo.astro': Foo }, stories, pages: { foo: extra }, exempt: [] }).join('\n'),
    ).toContain('Other.astro');
  });

  it('C-121 a repeated row fails', () => {
    const page = good().replace("{ name: 'a',", "{ name: 'a', type: '', description: '' }, { name: 'a',");
    expect(
      checkShape({ components: { 'Foo.astro': Foo }, stories, pages: { foo: page }, exempt: [] }).join('\n'),
    ).toContain('repeats');
  });

  it('C-121 an overlay rendered open in page flow fails unless allow-listed', () => {
    const Pop = `---\ninterface Props { open?: boolean }\n---\n<div class="ocx-pop" popover="manual" />`;
    const page = `import Pop from '@ocx-sh/theme/components/Pop.astro';\n## Stories\n<Stories of="pop" />\n<Pop open />\n## Props\n<PropsTable of="Pop.astro" rows={[{ name: 'open' }]} />\n`;
    const problems = checkShape({ components: { 'Pop.astro': Pop }, pages: { pop: page }, exempt: [] }).join('\n');
    expect(problems).toContain('rendered open');
    expect(
      checkShape({ components: { 'Pop.astro': Pop }, pages: { pop: page }, exempt: [], staticOpen: ['Pop.astro'] }),
    ).toEqual([]);
  });

  it('C-121 a missing stories/props heading fails naming page and id', () => {
    const problems = checkShape({
      components: { 'Foo.astro': Foo },
      stories,
      pages: { foo: good().replace('## Stories\n', '') },
      exempt: [],
    }).join('\n');
    expect(problems).toContain('foo');
    expect(problems).toContain('stories');
  });

  it('C-121 a Zag-backed component also needs events and keyboard sections', () => {
    const zagStories = { zag: [`import Zag from '@ocx-sh/theme/components/Zag.astro';\n<Zag />\n`] };
    const page = `## Stories\n<Stories of="zag" />\n## Props\n<PropsTable of="Zag.astro" rows={[{ name: 'value', type: '', description: '' }]} />\n`;
    const problems = checkShape({
      components: { 'Zag.astro': Zag },
      pages: { zag: page },
      stories: zagStories,
      exempt: [],
    }).join('\n');
    expect(problems).toContain('events');
    expect(problems).toContain('keyboard');
    expect(
      checkShape({
        components: { 'Zag.astro': Zag },
        pages: { zag: `${page}## Events\n## Keyboard\n` },
        stories: zagStories,
        exempt: [],
      }),
    ).toEqual([]);
  });
});

describe('C-125 checkShape on a page with <Stories> (planted failures)', () => {
  const Foo = `---\ninterface Props { a: string }\n---\n<div class="ocx-foo" />`;
  const Zag = `---\ninterface Props { value?: string }\n---\n<div class="ocx-zag" data-zag-root="tabs" />`;
  const Pop = `---\ninterface Props { open?: boolean }\n---\n<div class="ocx-pop" popover="manual" />`;
  const story = (tag: string, extra = '') =>
    `---\ntitle: Default\nheight: 100\n---\n\nimport ${tag} from '@ocx-sh/theme/components/${tag}.astro';\n\n<${tag}${extra} />\n`;
  const page = (slug: string, tag: string, row: string, extra = '') =>
    `import Stories from '../Stories.astro';\n${extra}\n## Stories\n\n<Stories of="${slug}" />\n\n## Props\n\n<PropsTable of="${tag}.astro" rows={[{ name: '${row}', type: '', description: '' }]} />\n`;
  const components = { 'Foo.astro': Foo, 'Zag.astro': Zag, 'Pop.astro': Pop };
  const exempt = ['Zag.astro', 'Pop.astro'];

  it('C-125 a page whose story imports the component passes', () => {
    expect(
      checkShape({ components, pages: { foo: page('foo', 'Foo', 'a') }, stories: { foo: [story('Foo')] }, exempt }),
    ).toEqual([]);
  });

  it('C-125 the PropsTable component must be imported by the page or one of its stories', () => {
    const problems = checkShape({ components, pages: { foo: page('foo', 'Foo', 'a') }, stories: {}, exempt });
    expect(problems.join('\n')).toContain('PropsTable of="Foo.astro" names no theme component');
  });

  it('C-125 <Stories of> must name the page slug, and the stories heading is required', () => {
    const wrong = page('foo', 'Foo', 'a').replace('of="foo"', 'of="bar"').replace('## Stories', '## Examples');
    const problems = checkShape({ components, pages: { foo: wrong }, stories: { foo: [story('Foo')] }, exempt });
    expect(problems.join('\n')).toContain('no <Stories of="foo" /> naming the page\'s own slug');
    expect(problems.join('\n')).toContain('no heading with id stories');
  });

  it('C-125 a page with a PropsTable but no <Stories> fails, even with demo/states headings', () => {
    const inline = page('foo', 'Foo', 'a').replace('<Stories of="foo" />', '## Demo\n## States');
    const problems = checkShape({ components, pages: { foo: inline }, stories: { foo: [story('Foo')] }, exempt });
    expect(problems.join('\n')).toContain('no <Stories of="foo" />');
  });

  it('C-125 a story page imports no theme component it does not render (D-SB6)', () => {
    const extra = "import Foo from '@ocx-sh/theme/components/Foo.astro';";
    const problems = checkShape({ components, pages: { foo: page('foo', 'Foo', 'a', extra) }, stories: {}, exempt });
    expect(problems.join('\n')).toContain('imports Foo.astro but never renders it');
  });

  it('C-125 a Zag-backed component still needs events and keyboard', () => {
    const problems = checkShape({
      components,
      pages: { zag: page('zag', 'Zag', 'value') },
      stories: { zag: [story('Zag')] },
      exempt: ['Foo.astro', 'Pop.astro'],
    }).join('\n');
    expect(problems).toContain('events');
    expect(problems).toContain('keyboard');
  });

  it('C-125 the overlay rule applies to stories', () => {
    const problems = checkShape({
      components,
      pages: { pop: page('pop', 'Pop', 'open') },
      stories: { pop: [story('Pop', ' open')] },
      exempt: ['Foo.astro', 'Zag.astro'],
    }).join('\n');
    expect(problems).toContain('rendered open');
  });
});

describe('C-121 the example showcase', () => {
  it('C-121 every exported component has a page of the contract shape with an exact PropsTable', () => {
    expect(checkShape({ components, pages, exempt: EXEMPT, modules, stories })).toEqual([]);
  });

  it('D-Z19 the grouped Stage-A pages are split, one page per component', () => {
    for (const grouped of ['form', 'overlays', 'status']) expect(pages[grouped], grouped).toBeUndefined();
  });
});

describe('C-120 component index', () => {
  it('C-120 every components/ page has a sidebar entry in the example config', () => {
    const config = readFileSync(join(themeRoot, '../../examples/starlight/astro.config.mjs'), 'utf8');
    const links = new Set([...config.matchAll(/link: '([^']+)'/g)].map((m) => m[1]));
    const missing = Object.keys(pages)
      .map((slug) => `/components/${slug.replace(/(^|\/)index$/, '')}/`.replace('//', '/'))
      .filter((link) => !links.has(link));
    expect(missing).toEqual([]);
  });

  it('C-120 components/index.mdx renders <ComponentIndex /> and nothing lists pages by hand', () => {
    const index = pages['index'] ?? '';
    expect(index).toMatch(/^import ComponentIndex from '[./]+\/components\/showcase\/ComponentIndex\.astro';$/m);
    expect(index).toMatch(/^<ComponentIndex \/>$/m);
    expect(index).not.toMatch(/\]\(\.\//);
  });

  it('C-120 ComponentIndex reads the whole docs collection through componentPages', () => {
    const src = readFileSync(join(kitDir, 'ComponentIndex.astro'), 'utf8');
    expect(src).toMatch(/getCollection\('docs'\)/);
    expect(src).toMatch(/componentPages\(/);
  });

  it('C-120 componentPages keeps every entry under components/ except the index, sorted by title', () => {
    const e = (id: string, title: string) => ({ id, data: { title } });
    const got = componentPages([
      e('components', 'Components'),
      e('components/tree', 'Tree'),
      e('probe/long', 'Long'),
      e('components/button', 'Button'),
      e('components/select', 'Select'),
    ]);
    expect(got.map((x) => x.id)).toEqual(['components/button', 'components/select', 'components/tree']);
  });
});
