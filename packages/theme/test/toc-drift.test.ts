// The TableOfContents and MobileTableOfContents overrides copy Starlight's markup (the phone one drops its script and
// scoped styles; ours adds the report/edit links; TocList drops the span in each row and the repeated `--depth` style):
// the rest must stay what Starlight renders, so a Starlight bump that changes the markup fails here instead of
// drifting silently under starlight.css.
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

/** The parts we change on purpose are gone: scripts, styles, Astro's scoped class hashes, our extra link list, the row
 * span, the phone list's <noscript> wrapper and the fold buttons. */
const normalise = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<ul class="ocx-toc-links">[\s\S]*?<\/ul>/g, '')
    .replace(/<\/?noscript>|<button type="button" aria-label="Subsections of [^"]*" hidden><\/button>/g, '')
    .replace(/ data-astro-cid-[a-z0-9]+(="[^"]*")?/g, '')
    .replace(/ style="--depth:\s*\d+;?"/g, '')
    .replace(/<a ([^>]*)><span[^>]*>([^<]*)<\/span><\/a>/g, '<a $1>$2</a>')
    .replace(/astro-[a-z0-9]{8}/g, '')
    .replace(/ class="([^"]*)"/g, (_, c: string) => (c.trim() ? ` class="${c.trim().replace(/\s+/g, ' ')}"` : ''))
    .replace(/ class="isMobile"/g, '')
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

describe('TocList: two elements a row', () => {
  it.each(['TableOfContents', 'MobileTableOfContents'])(
    '%s rows are li > a holding the text, depth on the ul',
    async (name) => {
      const container = await AstroContainer.create();
      const page = await container.renderToString(
        ((await import(`../src/starlight/${name}.astro`)) as { default: Component }).default,
        { request: new Request('https://ocx.sh/docs/x/'), locals },
      );
      const html = /<nav[\s\S]*?<\/nav>/.exec(page)?.[0] ?? ''; // the outline, not the edit and report links after it
      const rows = html.match(/<li>.*?<\/a>/g) ?? [];
      expect(rows).toEqual(['<li><a href="#a">A</a>', '<li><a href="#b">B</a>']);
      expect(html.match(/<ul style="--depth:(\d)">/g)).toEqual(['<ul style="--depth:0">', '<ul style="--depth:1">']);
      expect(html).not.toMatch(/<a [^>]*><span/);
      expect(html.match(/<(?:li|a|span)[^>]* style=/g)).toBeNull();
    },
  );
});
