// @ocx-sh/theme/csp: every inline <script> Shell renders (ocx and neutral mode) has a hash.
import { createHash } from 'node:crypto';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { describe, expect, it } from 'vitest';
import { INLINE_SCRIPT_HASHES } from '../src/csp.mjs';

const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: Window & typeof globalThis } };
type Component = Parameters<AstroContainer['renderToString']>[0];

const modes: [string, Record<string, unknown>][] = [
  ['ocx', {}],
  ['neutral', { brand: { title: 'Mirror' }, nav: [{ label: 'A', href: '/a/' }], footer: { links: [], note: 'n' } }],
];

describe('INLINE_SCRIPT_HASHES', () => {
  it('is a frozen list of sha256-<base64> sources', () => {
    expect(Object.isFrozen(INLINE_SCRIPT_HASHES)).toBe(true);
    expect(INLINE_SCRIPT_HASHES.length).toBeGreaterThan(0);
    for (const h of INLINE_SCRIPT_HASHES) expect(h).toMatch(/^sha256-[A-Za-z0-9+/]{43}=$/);
  });

  it.each(modes)('covers every inline script Shell renders in %s mode', async (_name, props) => {
    const container = await AstroContainer.create();
    const Shell = ((await import(`../src/layouts/${'Shell'}.astro`)) as { default: Component }).default;
    const html = await container.renderToString(Shell, {
      request: new Request('https://ocx.sh/docs/x/'),
      props: { title: 'T', ...props },
    });
    const inline = [...new JSDOM(html).window.document.querySelectorAll('script:not([src])')];
    expect(inline.length).toBeGreaterThan(0);
    for (const s of inline) {
      const h = `sha256-${createHash('sha256')
        .update(s.textContent ?? '')
        .digest('base64')}`;
      expect(INLINE_SCRIPT_HASHES, `no hash for inline script: ${s.textContent?.slice(0, 60)}`).toContain(h);
    }
  });
});
