// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The OCX Authors

import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { markdownToHtml, mdxToJs } from 'satteri';
import type { MdastPluginDefinition } from 'satteri';
import { describe, expect, it } from 'vitest';

import { glossary } from '../src/markdown/glossary.mjs';
import type { GlossaryFrequency } from '../src/markdown/glossary.mjs';
import { widgets } from '../src/markdown/widgets.mjs';
import { TERMS, row } from './glossary-terms.ts';

const ROOT = '/site/content/docs';
const PAGE = 'reference/glossary/';

function plugin(frequency?: GlossaryFrequency, exclude: string[] = ['changelog/']) {
  return glossary({
    terms: TERMS,
    root: ROOT,
    base: '/docs/',
    page: PAGE,
    exclude,
    ...(frequency ? { frequency } : {}),
  });
}
const at = (page: string) => pathToFileURL(`${ROOT}/${page}`);

async function md(
  source: string,
  page = 'guides/a.md',
  frequency?: GlossaryFrequency,
  extra: MdastPluginDefinition[] = [],
) {
  return (await markdownToHtml(source, { mdastPlugins: [...extra, plugin(frequency)], fileURL: at(page) })).html;
}
async function mdx(source: string, page = 'guides/a.mdx', frequency?: GlossaryFrequency) {
  return (await mdxToJs(source, { mdastPlugins: [plugin(frequency)], fileURL: at(page) })).code;
}
const links = (html: string) => [...html.matchAll(/<a href="([^"]*)" class="ocx-term">([^<]*)<\/a>/g)].map((m) => m[2]);
const anyTerm = (html: string) => (html.match(/ocx-term/g) ?? []).length;

describe('glossary plugin: the markup', () => {
  it('links a term to the glossary section with exactly one element and nothing else', async () => {
    const html = await md('Install a package.\n');
    assert.equal(
      html.trim(),
      '<p>Install a <a href="/docs/reference/glossary/#package" class="ocx-term">package</a>.</p>',
    );
  });

  it('keeps the source text, inflection and case', async () => {
    expect(links(await md('Packages. And Index.\n'))).toEqual(['Packages', 'Index']);
  });

  it('links the longest form: image index, not index', async () => {
    const html = await md('An image index.\n');
    expect(links(html)).toEqual(['image index']);
    expect(html).toContain('#image-index"');
  });

  it('an except phrase links nothing', async () => {
    expect(anyTerm(await md('A package manager.\n'))).toBe(0);
  });

  it('never links inside multi-platform, index.ocx.sh, $OCX_HOME, --platform or metadata.json', async () => {
    const html = await md('multi-platform, index.ocx.sh, $OCX_HOME, --platform, metadata.json.\n');
    expect(anyTerm(html)).toBe(0);
  });
});

describe('glossary plugin: skipped ancestors', () => {
  it.each([
    ['a heading', '## The package\n'],
    ['link text', '[package](x)\n'],
    ['a reference link', '[package][r]\n\n[r]: x\n'],
    ['inline code', '`package`\n'],
    ['a code fence', '```\npackage\n```\n'],
    ['alt text', '![package](x.png)\n'],
    ['raw HTML', '<p>package</p>\n'],
    ['a link in emphasis', '*[package](x)*\n'],
  ])('%s', async (_name, source) => {
    expect(anyTerm(await md(source))).toBe(0);
  });

  it('still links emphasised prose and table cells and list items', async () => {
    const html = await md('**package**\n\n- index\n\n| a |\n|---|\n| platform |\n');
    expect(links(html)).toEqual(['package', 'index', 'platform']);
  });

  // Starlight's aside plugin, as it runs before this one on a real page: the label paragraph is dropped and its
  // children move into a fresh `<p aria-hidden="true">`, so `directiveLabel` is gone by the time a text is visited.
  const starlightAside: MdastPluginDefinition = {
    name: 'test/starlight-aside',
    containerDirective(node) {
      const [first, ...rest] = node.children as never[] as {
        type: string;
        data?: { directiveLabel?: boolean };
        children: never[];
      }[];
      const label = first?.type === 'paragraph' && first.data?.directiveLabel;
      const el = (hName: string, hProperties: Record<string, string>, children: unknown[]) =>
        ({ type: 'paragraph', data: { hName, hProperties }, children }) as never;
      return el('aside', { class: 'starlight-aside' }, [
        el(
          'p',
          { class: 'starlight-aside__title', 'aria-hidden': 'true' },
          label ? first.children : [{ type: 'text', value: 'Note' }],
        ),
        el('div', { class: 'starlight-aside__content' }, label ? rest : [first, ...rest]),
      ]);
    },
  };
  const ASIDE = ':::note[A package title]\nthe index body\n:::\n';

  it('an aside title is never linked, in .md and in .mdx; its body is prose', async () => {
    const html = (
      await markdownToHtml(ASIDE, {
        features: { directive: true },
        mdastPlugins: [starlightAside, plugin()],
        fileURL: at('guides/a.md'),
      })
    ).html;
    expect(links(html)).toEqual(['index']);
    const code = (
      await mdxToJs(ASIDE, {
        features: { directive: true },
        mdastPlugins: [starlightAside, plugin()],
        fileURL: at('guides/a.mdx'),
      })
    ).code;
    expect(code.match(/ocx-term/g)).toHaveLength(1);
    expect(code).not.toMatch(/aria-hidden[^]*?ocx-term[^]*?starlight-aside__content/);
  });

  it('an aside title is a label, not prose; its body is prose', async () => {
    const aside: MdastPluginDefinition = {
      name: 'test/aside',
      containerDirective: (node) => ({ type: 'paragraph', data: { hName: 'aside' }, children: node.children }) as never,
    };
    const html = await md('> [!NOTE] A package title\n> the index body\n', 'guides/a.md', undefined, [widgets, aside]);
    expect(links(html)).toEqual(['index']);
  });

  it('a JSX attribute value is never matched, its children are not either', async () => {
    const code = await mdx('A <Node name="entrypoints/" label="package">entry package</Node> and a platform.\n');
    expect(code).toContain('name: "entrypoints/"');
    expect(code).toContain('label: "package"');
    expect(code.match(/ocx-term/g)).toHaveLength(1);
    expect(code).toContain('#platform');
  });

  it.each(['Tree', 'ShellSession', 'Terminal', 'Tooltip', 'InstallCommand'])(
    'the content of <%s> is never linked',
    async (name) => {
      expect(anyTerm(await mdx(`<${name}>package index</${name}>\n`))).toBe(0);
    },
  );

  it.each(['Steps', 'Tabs', 'TabItem', 'Aside'])('the content of <%s> is prose', async (name) => {
    expect(anyTerm(await mdx(`<${name}>\n\nthe package\n\n</${name}>\n`))).toBe(1);
  });

  it('a heading in MDX is skipped too', async () => {
    expect(anyTerm(await mdx('# package\n'))).toBe(0);
  });
});

describe('glossary plugin: frequency', () => {
  const page =
    'Lead package and package.\n\n## One\n\npackage and index\n\n### Sub\n\npackage index\n\n## Two\n\nindex package\n';

  it('page (the default): the first usage of each term per page', async () => {
    const html = await md(page);
    expect(links(html)).toEqual(['package', 'index']);
    expect(await md(page, 'guides/a.md', 'page')).toBe(html);
  });

  it('section: the first usage per ## section; text before the first ## is its own section', async () => {
    // lead: package | one: package, index (the ### does not open a section) | two: index, package
    expect(links(await md(page, 'guides/a.md', 'section'))).toEqual([
      'package',
      'package',
      'index',
      'index',
      'package',
    ]);
  });

  it('all: every usage', async () => {
    expect(links(await md(page, 'guides/a.md', 'all'))).toHaveLength(8);
  });

  it('a skipped usage does not use up the first one', async () => {
    expect(links(await md('## package\n\n`package`\n\n[package](x)\n\nthe package\n'))).toEqual(['package']);
  });

  it('state is per page: two documents each link their first usage', async () => {
    expect(links(await md('package\n'))).toEqual(['package']);
    expect(links(await md('package\n', 'guides/b.md'))).toEqual(['package']);
  });
});

describe('glossary plugin: pages', () => {
  it('links in a .md page and in a .mdx page', async () => {
    expect(anyTerm(await md('the package\n', 'guides/a.md'))).toBe(1);
    expect(anyTerm(await mdx('the package\n', 'guides/a.mdx'))).toBe(1);
  });

  it('a page under an excluded route links nothing, an index page included', async () => {
    expect(anyTerm(await md('the package\n', 'changelog/v1.md'))).toBe(0);
    expect(anyTerm(await md('the package\n', 'changelog/index.md'))).toBe(0);
    expect(anyTerm(await md('the package\n', 'changelog.md'))).toBe(0);
    expect(anyTerm(await md('the package\n', 'changelogs/a.md'))).toBe(1);
  });

  it('the glossary page does not link its own terms, as page.md or page/index.md', async () => {
    expect(anyTerm(await md('the package\n', 'reference/glossary.md'))).toBe(0);
    expect(anyTerm(await md('the package\n', 'reference/glossary/index.mdx'))).toBe(0);
    expect(anyTerm(await md('the package\n', 'reference/other.md'))).toBe(1);
  });

  it('a page outside the docs tree (a story) links', async () => {
    expect(anyTerm(await md('the package\n', '../../stories/a/default.mdx'))).toBe(1);
  });

  it('a document with no file URL links', async () => {
    const html = (await markdownToHtml('the package\n', { mdastPlugins: [plugin()] })).html;
    expect(anyTerm(html)).toBe(1);
  });
});

describe('glossary plugin: excludePages', () => {
  const GH = 'integration/github-actions/';
  const terms = [
    ...TERMS.filter((t) => t.id !== 'index'),
    { ...TERMS.find((t) => t.id === 'index')!, excludePages: [GH] },
  ];
  async function on(source: string, page: string, frequency?: GlossaryFrequency) {
    const p = glossary({ terms, root: ROOT, base: '/docs/', page: PAGE, ...(frequency ? { frequency } : {}) });
    return (await markdownToHtml(source, { mdastPlugins: [p], fileURL: at(page) })).html;
  }

  it('links the term elsewhere, not on the page or below it, an index page included', async () => {
    expect(links(await on('the index\n', 'guides/a.md'))).toEqual(['index']);
    expect(links(await on('the index\n', 'integration/github-actions.md'))).toEqual([]);
    expect(links(await on('the index\n', 'integration/github-actions/index.md'))).toEqual([]);
    expect(links(await on('the index\n', 'integration/github-actions/deep/a.md'))).toEqual([]);
    expect(links(await on('the index\n', 'integration/github-actionsx/a.md'))).toEqual(['index']);
  });

  it("another term's longer form containing the word still links, and the text it holds is not consumed", async () => {
    expect(links(await on('an image index and a platform\n', 'integration/github-actions/a.md'))).toEqual([
      'image index',
      'platform',
    ]);
  });

  it.each(['all', 'section', 'page'] as const)('frequency %s respects it', async (f) => {
    const src = 'index\n\n## b\n\nindex index\n';
    expect(links(await on(src, 'integration/github-actions/a.md', f))).toEqual([]);
    expect(links(await on(src, 'guides/a.md', f)).length).toBe({ all: 3, section: 2, page: 1 }[f]);
  });

  it('an except phrase of an excluded term still consumes its text', async () => {
    const t = [
      row('package', ['package'], { except: ['package manager'], excludePages: [GH] }),
      row('manager', ['manager']),
    ];
    const p = glossary({ terms: t, root: ROOT, base: '/docs/', page: PAGE });
    const html = (await markdownToHtml('a package manager\n', { mdastPlugins: [p], fileURL: at(`${GH}a.md`) })).html;
    expect(links(html)).toEqual([]);
  });
});
