// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The OCX Authors

import { markdownToHtml, mdxToJs, type MdastNode, type MdastPluginDefinition } from 'satteri';
import { describe, expect, it } from 'vitest';

import { math } from '../src/markdown/math.mjs';
import { taskLabels, widgets } from '../src/markdown/widgets.mjs';

// Stand-in for Starlight's asides plugin, which runs after `widgets` and is not exported: it reads the
// directive name and the `directiveLabel` paragraph the same way. The built showcase page covers the real one.
const asides: MdastPluginDefinition = {
  name: 'asides',
  containerDirective(node, ctx) {
    if (!['note', 'tip', 'caution', 'danger'].includes(node.name)) return;
    const [first, ...rest] = node.children;
    const labelled = first?.type === 'paragraph' && first.data && 'directiveLabel' in first.data;
    const title = labelled ? ctx.textContent(first) : node.name;
    const hProperties = { class: node.name, title };
    const aside = {
      type: 'paragraph',
      data: { hName: 'aside', hProperties },
      children: labelled ? rest : node.children,
    };
    return aside as unknown as MdastNode;
  },
};
const PLUGINS = [widgets, asides, math];

// `directive: false` where a test needs `word:word` text: Starlight's restoration, which turns an
// unclaimed `:word` directive back into text, is not in this pipeline.
const md = async (source: string, { dollars = false, directive = true } = {}) =>
  (
    await markdownToHtml(source, {
      features: { directive, math: dollars },
      mdastPlugins: PLUGINS,
      hastPlugins: [taskLabels],
    })
  ).html.trim();
const mdx = async (source: string) =>
  (await mdxToJs(source, { features: { directive: true }, mdastPlugins: PLUGINS })).code;

describe('alerts', () => {
  it.each([
    ['NOTE', 'note', 'Note'],
    ['TIP', 'tip', 'Tip'],
    ['IMPORTANT', 'note', 'Important'],
    ['WARNING', 'caution', 'Warning'],
    ['CAUTION', 'danger', 'Caution'],
    ['warning', 'caution', 'Warning'],
  ])('[!%s] becomes a %s aside titled %s', async (type, variant, title) => {
    expect(await md(`> [!${type}]\n> Body *text*.\n`)).toBe(
      `<aside class="${variant}" title="${title}"><p>Body <em>text</em>.</p></aside>`,
    );
  });

  it('takes a GitLab title from the marker line and keeps later paragraphs', async () => {
    expect(await md('> [!warning] Data deletion\n>\n> One.\n>\n> Two.\n')).toBe(
      '<aside class="caution" title="Data deletion"><p>One.</p><p>Two.</p></aside>',
    );
  });

  it('leaves a quote without a leading marker alone', async () => {
    expect(await md('> Quote [!NOTE]\n')).toBe('<blockquote>\n<p>Quote [!NOTE]</p>\n</blockquote>');
    expect(await md('> [!UNKNOWN]\n> x\n')).toMatch(/^<blockquote>/);
  });

  it('works in MDX', async () => {
    expect(await mdx('> [!CAUTION]\n> careful\n')).toMatch(/class: "danger",\s*title: "Caution"/);
  });
});

describe('asides', () => {
  it.each([
    ['warning', 'caution', 'Warning'],
    ['info', 'note', 'Info'],
    ['important', 'note', 'Important'],
  ])(':::%s becomes a %s aside titled %s', async (name, variant, title) => {
    expect(await md(`:::${name}\nbody\n:::\n`)).toBe(`<aside class="${variant}" title="${title}"><p>body</p></aside>`);
  });

  it('keeps an author title', async () => {
    expect(await md(':::warning[Mind this]\nbody\n:::\n')).toBe(
      '<aside class="caution" title="Mind this"><p>body</p></aside>',
    );
  });
});

describe('collapsibles', () => {
  const chevron =
    /<svg class="ocx-icon ocx-collapsible__chevron" data-icon="chevron-down"[^>]*><path [^>]*\/><\/svg><\/summary>/;

  it(':::details[label]{open} becomes an open native details', async () => {
    const html = await md(':::details[More *info*]{open}\nhidden **x**\n:::\n');
    expect(html).toMatch(/^<details open><summary>More <em>info<\/em><svg /);
    expect(html).toMatch(chevron);
    expect(html).toMatch(/<\/summary><p>hidden <strong>x<\/strong><\/p><\/details>$/);
  });

  it(':::details without a label is titled Details', async () => {
    expect(await md(':::details\nplain\n:::\n')).toMatch(/^<details><summary>Details<svg /);
  });

  it('raw <details> gets the chevron in its summary, in Markdown and MDX', async () => {
    expect(await md('<details>\n<summary>Title</summary>\n\nbody\n\n</details>\n')).toMatch(chevron);
    expect(await mdx('<details>\n<summary>Title</summary>\n\nbody\n\n</details>\n')).toMatch(
      /_components\.summary, \{ children: \["Title", _jsx\(Fragment, \{ "set:html": "<svg class=\\"ocx-icon ocx-collapsible__chevron\\"/,
    );
  });
});

describe('emoji', () => {
  it('replaces GitHub shortcodes, adjacent ones too', async () => {
    expect(await md('Ship :rocket: :+1::tada:\n')).toBe('<p>Ship 🚀 👍🎉</p>');
  });

  it('leaves unknown names, code and shortcodes touching a word alone', async () => {
    expect(
      await md('`:rocket:` :nope: index:package:1 a:rocket:b ns:rocket: end\n\n```\n:rocket:\n```\n', {
        directive: false,
      }),
    ).toBe(
      '<p><code>:rocket:</code> :nope: index:package:1 a:rocket:b ns:rocket: end</p>\n<pre><code>:rocket:\n</code></pre>',
    );
  });
});

describe('GitLab extras', () => {
  it('turns {+ +} and {- -} into ins and del', async () => {
    expect(await md('Was {- old -}, now {+ new +}.\n')).toBe('<p>Was <del>old</del>, now <ins>new</ins>.</p>');
  });

  it('drops [[_TOC_]] and [TOC] paragraphs', async () => {
    expect(await md('[[_TOC_]]\n\n[TOC]\n\nkept\n')).toBe('<p>kept</p>');
  });
});

describe('comments', () => {
  it('drops a whole-node HTML comment, keeps other HTML', async () => {
    expect(await md('<!-- doc_type: how-to -->\n\ntext\n\n<div>kept</div>\n')).toBe('<p>text</p>\n<div>kept</div>');
  });
});

describe('math', () => {
  it('renders a math fence as display MathML', async () => {
    expect(await md('```math\nx^2\n```\n')).toMatch(
      /^<math display="block" class="tml-display"[^>]*><msup><mi>x<\/mi>/,
    );
  });

  it('leaves $ text alone unless the math feature parses it', async () => {
    expect(await md('Use $HOME and $PATH.\n')).toBe('<p>Use $HOME and $PATH.</p>');
    expect(await md('Inline $a^2$.\n', { dollars: true })).toMatch(/^<p>Inline <math><msup>/);
  });

  it('emits a Fragment in MDX, where raw HTML would parse as JSX', async () => {
    expect(await mdx('```math\nx\n```\n')).toMatch(/_jsx\(Fragment, \{ "set:html": "<math display=\\"block\\"/);
  });

  it('fails the build on a formula that does not parse', async () => {
    await expect(md('```math\n\\frac{1}{\n```\n')).rejects.toThrow(/^math: /);
  });
});

describe('task lists', () => {
  const boxes = async (source: string) => [...(await md(source)).matchAll(/<input [^>]*>/g)].map((m) => m[0]);

  it("names each checkbox by its item's text, without a nested list or a footnote mark", async () => {
    expect(await boxes('- [x] Install **ocx**\n- [ ] Pin it[^1]\n  - [ ] nested\n\n[^1]: n\n')).toEqual([
      '<input type="checkbox" checked disabled aria-label="Install ocx">',
      '<input type="checkbox" disabled aria-label="Pin it">',
      '<input type="checkbox" disabled aria-label="nested">',
    ]);
  });

  it('names the box in a loose item from its first paragraph only', async () => {
    expect(await boxes('1. [x] First\n\n   More\n')).toEqual([
      '<input type="checkbox" checked disabled aria-label="First">',
    ]);
  });
});
