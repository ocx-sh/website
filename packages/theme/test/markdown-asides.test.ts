// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The OCX Authors

import { markdownToHtml } from 'satteri';
import { describe, expect, it } from 'vitest';

import { asides, taskLabels, widgets } from '../src/markdown/widgets.mjs';

// The standalone pipeline a page outside Starlight runs (a package README): no directives, so `a:b` stays text.
const md = async (source: string) =>
  (
    await markdownToHtml(source, {
      features: { directive: false },
      mdastPlugins: [widgets, asides],
      hastPlugins: [taskLabels],
    })
  ).html.trim();

describe('asides', () => {
  it("renders a GitHub alert as Starlight Aside markup, titled with GitHub's word", async () => {
    const html = await md('> [!WARNING]\n> Mind the gap.');
    expect(html).toBe(
      '<aside aria-label="Warning" class="starlight-aside starlight-aside--caution"><p class="starlight-aside__title" aria-hidden="true">Warning</p><div class="starlight-aside__content"><p>Mind the gap.</p></div></aside>',
    );
  });

  it('keeps a GitLab title and the body blocks after it', async () => {
    const html = await md('> [!tip] Faster builds\n> Use a cache.\n>\n> - one');
    expect(html).toContain('aria-label="Faster builds" class="starlight-aside starlight-aside--tip"');
    expect(html).toContain('<div class="starlight-aside__content"><p>Use a cache.</p><ul>');
  });

  it('leaves a plain quote and colon text alone', async () => {
    expect(await md('> just a quote with index:package:1.0')).toBe(
      '<blockquote>\n<p>just a quote with index:package:1.0</p>\n</blockquote>',
    );
  });
});
