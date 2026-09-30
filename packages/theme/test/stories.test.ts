// C-125 stories lint: the story kit's parsing, and every story directory's contract (default plus
// at least one more, valid frontmatter, a doc page embedding it, and each `<Stories of>` naming one).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseFrontmatter,
  snippet,
  storiesOf,
  storyId,
  storyRoute,
} from '../../../examples/starlight/src/components/showcase/stories.mjs';
import { stripFences } from './showcase.mjs';

const example = new URL('../../../examples/starlight/', import.meta.url).pathname;
const storiesDir = join(example, 'src/stories');
const docsDir = join(example, 'src/content/docs/components');

/** rel path under stories/ → source */
const stories = Object.fromEntries(
  readdirSync(storiesDir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.mdx'))
    .map((f) => [f.split('\\').join('/'), readFileSync(join(storiesDir, f), 'utf8')]),
);
const dirs = [...new Set(Object.keys(stories).map((f) => f.slice(0, f.lastIndexOf('/'))))];
const docs = Object.fromEntries(
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

describe('C-125 parseFrontmatter', () => {
  it('reads strings (quoted or not), integers and booleans', () => {
    expect(
      parseFrontmatter(
        '---\ntitle: More tabs than fit\ndescription: "Scrolls: sideways."\nheight: 180\norder: 3\nlog: true\nprose: false\n---\n\nbody',
      ),
    ).toEqual({
      title: 'More tabs than fit',
      description: 'Scrolls: sideways.',
      height: 180,
      order: 3,
      log: true,
      prose: false,
    });
  });

  it.each([
    ['no block', 'title: x\nheight: 1'],
    ['an unknown key', '---\ntitle: x\nheight: 1\ncolour: red\n---'],
    ['a repeated key', '---\ntitle: x\ntitle: y\nheight: 1\n---'],
    ['a non-integer height', '---\ntitle: x\nheight: 12px\n---'],
    ['a zero height', '---\ntitle: x\nheight: 0\n---'],
    ['a non-boolean flag', '---\ntitle: x\nheight: 1\nlog: yes\n---'],
    ['no title', '---\nheight: 1\n---'],
    ['no height', '---\ntitle: x\n---'],
    ['a nested value', '---\ntitle: x\nheight: 1\n  deep: 1\n---'],
  ])('throws on %s', (_, raw) => {
    expect(() => parseFrontmatter(raw)).toThrow(/story/);
  });
});

describe('C-125 kit helpers', () => {
  it('snippet drops the frontmatter and trims', () => {
    expect(snippet('---\ntitle: x\nheight: 1\n---\n\nimport A from "a";\n\n<A />\n\n')).toBe(
      'import A from "a";\n\n<A />',
    );
  });

  it('storyId and storyRoute map a glob key to its page', () => {
    expect(storyId('../../stories/iconography/icon/default.mdx')).toBe('iconography/icon/default');
    expect(storyRoute('tabs/default')).toBe('/docs/stories/tabs/default/');
  });

  it('storiesOf keeps one directory: default first, then order, then title', () => {
    const fm = (title: string, order = '') => `---\ntitle: ${title}\nheight: 1\n${order}---\n`;
    const got = storiesOf('tabs', {
      '../../stories/tabs/zeta.mdx': fm('Zeta'),
      '../../stories/tabs/alpha.mdx': fm('Alpha'),
      '../../stories/tabs/second.mdx': fm('Second', 'order: 2\n'),
      '../../stories/tabs/first.mdx': fm('First', 'order: 1\n'),
      '../../stories/tabs/default.mdx': fm('Default', 'order: 9\n'),
      '../../stories/tabs/deeper/x.mdx': fm('Nested'),
      '../../stories/tabs-more/default.mdx': fm('Other'),
    });
    expect(got.map((s) => s.name)).toEqual(['default', 'first', 'second', 'alpha', 'zeta']);
  });
});

describe('C-125 the example stories', () => {
  it('there are stories to check', () => {
    expect(dirs.length).toBeGreaterThan(0);
  });

  it.each(dirs)('%s has default.mdx plus at least one more story', (dir) => {
    const names = Object.keys(stories).filter((f) => f.slice(0, f.lastIndexOf('/')) === dir);
    expect(names).toContain(`${dir}/default.mdx`);
    expect(names.length).toBeGreaterThan(1);
  });

  it.each(Object.keys(stories))('%s has valid frontmatter', (f) => {
    expect(() => parseFrontmatter(stories[f] ?? '')).not.toThrow();
  });

  it.each(dirs)('%s is embedded by its doc page', (dir) => {
    expect(docs[dir], `components/${dir}.mdx`).toBeDefined();
    expect(stripFences(docs[dir] ?? '')).toMatch(new RegExp(`<Stories\\s+of="${dir}"`));
  });

  it('every <Stories of> names a story directory', () => {
    const named = Object.values(docs).flatMap((mdx) =>
      [...stripFences(mdx).matchAll(/<Stories\s+of="([^"]+)"/g)].map((m) => m[1]),
    );
    for (const of of named) expect(dirs, of).toContain(of);
  });

  it('no story lives outside a component directory, and no docs content under stories/ collides', () => {
    for (const f of Object.keys(stories)) expect(f, f).toMatch(/^[a-z0-9-]+(\/[a-z0-9-]+)*\/[a-z0-9-]+\.mdx$/);
    expect(existsSync(join(example, 'src/content/docs/stories'))).toBe(false);
  });

  // No new dependency: compiled only when @mdx-js/mdx resolves from the example's tree. Astro 7's MDX
  // runs on satteri, so this is skipped today; `astro build` compiles every story instead.
  const mdx = (() => {
    try {
      return createRequire(join(example, 'package.json')).resolve('@mdx-js/mdx');
    } catch {
      return undefined;
    }
  })();
  it.skipIf(!mdx).each(Object.keys(stories))('%s compiles as MDX', async (f) => {
    const { compile } = (await import(mdx ?? '')) as { compile: (src: string) => Promise<unknown> };
    await expect(compile(snippet(stories[f] ?? ''))).resolves.toBeDefined();
  });
});
