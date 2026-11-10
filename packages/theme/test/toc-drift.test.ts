// The TableOfContents and MobileTableOfContents overrides copy Starlight's markup (the phone one drops its script and
// scoped styles; ours adds the report/edit links): the rest must stay what Starlight renders, so a Starlight bump
// that changes the markup fails here instead of drifting silently under starlight.css.
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';

type Component = Parameters<AstroContainer['renderToString']>[0];

const toc = {
  minHeadingLevel: 2,
  maxHeadingLevel: 3,
  items: [{ depth: 2, slug: 'a', text: 'A', children: [{ depth: 3, slug: 'b', text: 'B', children: [] }] }],
};
const t = Object.assign((key: string) => key, { all: () => ({}) });
const locals = {
  t,
  starlightRoute: { toc, editUrl: undefined, entry: { data: {} }, dir: 'ltr' },
} as unknown as App.Locals;

/** The parts we change on purpose are gone: scripts, styles, Astro's scoped class hashes, our extra link list. */
const normalise = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<ul class="ocx-toc-links">[\s\S]*?<\/ul>/g, '')
    .replace(/ data-astro-cid-[a-z0-9]+(="[^"]*")?/g, '')
    .replace(/astro-[a-z0-9]{8}/g, '')
    .replace(/ class="([^"]*)"/g, (_, c: string) => (c.trim() ? ` class="${c.trim().replace(/\s+/g, ' ')}"` : ''))
    .replace(/\s+/g, ' ')
    .replace(/> </g, '><')
    .trim();

describe('TOC overrides keep Starlight’s markup', () => {
  it.each(['TableOfContents', 'MobileTableOfContents'])('%s', async (name) => {
    const container = await AstroContainer.create();
    const render = async (spec: string) =>
      container.renderToString(((await import(/* @vite-ignore */ spec)) as { default: Component }).default, {
        request: new Request('https://ocx.sh/docs/x/'),
        locals,
      });
    const ours = normalise(await render(`../src/starlight/${name}.astro`));
    expect(ours).toContain('<nav');
    expect(ours).toBe(normalise(await render(`@astrojs/starlight/components/${name}.astro`)));
  });
});
