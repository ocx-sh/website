import { describe, expect, it } from 'vitest';
import nav from '../../packages/theme/src/nav.json' with { type: 'json' };
import { rewriteMdLinks } from './links.ts';
import { SITES, findSite, previewUrl, previewZone, secretName, slug } from './sites.mjs';

describe('preview sites', () => {
  it('names, host slugs and mounts are unique', () => {
    for (const key of [(s: (typeof SITES)[number]) => s.name, slug, (s: (typeof SITES)[number]) => s.mount])
      expect(new Set(SITES.map(key)).size).toBe(SITES.length);
  });

  it('every mount is a claim path of a repo that deploys it', () => {
    for (const s of SITES) expect(nav.claims.find((c) => c.path === s.mount)?.repo, s.name).toBe(s.repo);
  });

  it('a site is found by name or by host slug; an unknown one lists the known', () => {
    expect(findSite('rules-ocx')).toBe(findSite('rules_ocx'));
    expect(() => findSite('nope')).toThrow(/known: ocx, rules_ocx/);
  });

  it('a landing route is a root-relative directory route', () => {
    for (const s of SITES) if (s.home) expect(s.home).toMatch(/^\/([a-z0-9-]+\/)*$/);
  });
});

// Zone, secret and URL names of a site (C-317, C-321, C-330).
describe('preview zone names', () => {
  it('secretName is BUNNY_PREVIEW_KEY_ plus the slug uppercased, charset [A-Z0-9_]', () => {
    expect(secretName('rules-ocx')).toBe('BUNNY_PREVIEW_KEY_RULES_OCX');
    expect(secretName('rules_ocx')).toBe('BUNNY_PREVIEW_KEY_RULES_OCX');
    for (const s of SITES) expect(secretName(s.name)).toMatch(/^BUNNY_PREVIEW_KEY_[A-Z0-9_]+$/);
  });

  it('previewZone is sh-ocx-preview-<slug>', () => {
    expect(previewZone('rules_ocx')).toBe('sh-ocx-preview-rules-ocx');
    for (const s of SITES) expect(previewZone(s.name)).toBe(`sh-ocx-preview-${slug(s)}`);
  });

  it('previewUrl is the zone b-cdn.net root', () => {
    for (const s of SITES) expect(previewUrl(s)).toBe(`https://sh-ocx-preview-${slug(s)}.b-cdn.net/`);
    expect(previewUrl(findSite('rules_ocx'))).toBe('https://sh-ocx-preview-rules-ocx.b-cdn.net/');
  });
});

describe('rewriteMdLinks', () => {
  const at = (text: string, page = 'guide/quickstart.md') => rewriteMdLinks(text, page);

  it('rewrites relative .md links to routes, keeping the fragment', () => {
    expect(at('[a](api.md) [b](../reference/api.md#x) [c](./sub/deep.mdx?q=1)')).toBe(
      '[a](/guide/api/) [b](/reference/api/#x) [c](/guide/sub/deep/?q=1)',
    );
  });

  it('maps index pages to their directory, and a root-relative link from the docs root', () => {
    expect(at('[a](../index.md) [b](sub/index.md) [c](/top.md)')).toBe('[a](/) [b](/guide/sub/) [c](/top/)');
  });

  it('rewrites reference-style definitions', () => {
    expect(at('see [x]\n\n[x]: ../in-depth/indices.md#public\n[y]: <api.md>')).toBe(
      'see [x]\n\n[x]: /in-depth/indices/#public\n[y]: </guide/api/>',
    );
  });

  it('leaves external, anchor, non-md and out-of-tree links alone', () => {
    const same = '[a](https://x.dev/a.md) [b](#sec) [c](../reference/api/) [d](../../../README.md) [e](mailto:a@b.md)';
    expect(at(same)).toBe(same);
  });

  it('leaves code fences untouched', () => {
    const fenced = '```md\n[a](api.md)\n```\n\n[a](api.md)';
    expect(at(fenced)).toBe('```md\n[a](api.md)\n```\n\n[a](/guide/api/)');
  });
});
