// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The OCX Authors

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { markdownToHtml, mdxToJs, type HastPluginDefinition } from 'satteri';
import { describe, expect, it } from 'vitest';

import { addMarkdownPlugins, type SatteriOptions } from '../src/markdown/index.mjs';
import { starlightInternal } from '../src/starlight/index.mjs';

const DOCS = '/site/src/content/docs/';
// Stand-in for Starlight's heading id plugin (github-slugger over the heading text), which is not importable here.
const ids: HastPluginDefinition = {
  name: 'ids',
  element: {
    filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
    visit(h, ctx) {
      if (typeof h.properties?.['id'] !== 'string')
        ctx.setProperty(h, 'id', ctx.textContent(h).toLowerCase().replace(/\W+/g, '-'));
    },
  },
};

/** The plugins the theme adds, over `ids`, for a file under `file`. */
function plugins(): SatteriOptions {
  const options: SatteriOptions = { features: {}, mdastPlugins: [], hastPlugins: [] };
  addMarkdownPlugins(options, {
    srcDir: '/site/src/',
    docsDir: DOCS,
    base: '/docs/',
    math: false,
    smartypants: false,
    headingIds: () => ids,
  });
  return options;
}

const md = (source: string, file = `${DOCS}page.md`) => {
  const { hastPlugins, mdastPlugins } = plugins();
  const { html } = markdownToHtml(source, {
    features: { headingAttributes: true },
    mdastPlugins: mdastPlugins as never,
    hastPlugins: hastPlugins as never,
    fileURL: pathToFileURL(file),
  });
  return html.trim();
};

describe('heading permalinks: one element a heading', () => {
  it('the heading holds one link, named by its text, to its own id; no wrapper, no icon, no hidden label', () => {
    expect(md('## Why pin tools\n')).toBe(
      '<h2 id="why-pin-tools"><a class="ocx-anchor" href="#why-pin-tools">Why pin tools</a></h2>',
    );
  });

  it('every level gets one, and inline markup stays inside the link', () => {
    const html = md('# One\n\n### Run `ocx` *now*\n');
    expect(html).toBe(
      '<h1 id="one"><a class="ocx-anchor" href="#one">One</a></h1>\n' +
        '<h3 id="run-ocx-now"><a class="ocx-anchor" href="#run-ocx-now">Run <code>ocx</code> <em>now</em></a></h3>',
    );
  });

  it('an explicit {#id} is the link target', () => {
    expect(md('## Update {#updating}\n')).toBe(
      '<h2 id="updating"><a class="ocx-anchor" href="#updating">Update</a></h2>',
    );
  });

  it('a heading that holds a link keeps its id and gets no nested link', () => {
    expect(md('## See [the guide](/guide/)\n')).toBe('<h2 id="see-the-guide">See <a href="/guide/">the guide</a></h2>');
  });

  it('a file outside the docs collection is left alone', () => {
    expect(md('## Plain\n', '/site/src/pages/plain.md')).not.toContain('ocx-anchor');
  });

  it('MDX gets them too', () => {
    const { hastPlugins, mdastPlugins } = plugins();
    const { code } = mdxToJs('## Hello world\n', {
      features: { headingAttributes: true },
      mdastPlugins: mdastPlugins as never,
      hastPlugins: hastPlugins as never,
      fileURL: pathToFileURL(`${DOCS}page.mdx`),
    });
    expect(code).toMatch(/ocx-anchor/);
    expect(code).toMatch(/href: "#hello-world"/);
  });
});

describe('heading permalink glyph', () => {
  const css = readFileSync(new URL('../src/starlight/starlight.css', import.meta.url), 'utf8');
  const block = css.slice(css.indexOf('/* Heading permalinks'), css.indexOf('/* Theme switch'));

  it("the mask is Starlight's own link-alt glyph, inline, so the look is the one it had", async () => {
    const { Icons } = (await import(pathToFileURL(starlightInternal('Icons.js')).href)) as {
      Icons: Record<string, string>;
    };
    const d = /d="([^"]+)"/g;
    const want = [...(Icons['link-alt'] ?? '').matchAll(d)].map((m) => m[1]);
    const uris = [...block.matchAll(/mask: url\("(data:image\/svg\+xml,[^"]*)"\)/g)].map((m) =>
      decodeURIComponent(m[1] ?? ''),
    );
    expect(want.length).toBeGreaterThan(0);
    expect(uris).toHaveLength(1);
    for (const uri of uris) for (const path of want) expect(uri).toContain(`d='${path}'`);
  });

  it('shows on hover and focus where there is hover, and always where there is not', () => {
    expect(block).toMatch(/@media \(hover: hover\)[\s\S]*opacity: 0/);
    expect(block).toMatch(/:focus-visible::after[\s\S]*opacity: 1/);
  });

  it('keeps a visible focus ring on the link', () => {
    expect(block).toMatch(/\.ocx-anchor:focus-visible \{[^}]*outline: var\(--ocx-focus-ring\)/);
  });
});
