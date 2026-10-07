// C-314 data shape and the matcher contract, over the real planned rules.
import { describe, expect, it } from 'vitest';
import legacy from './legacy.json' with { type: 'json' };
import schema from './legacy.schema.json' with { type: 'json' };
import nav from '@ocx-sh/theme/nav.json' with { type: 'json' };
import { SITES, previewZone, slug } from '../../scripts/previews/sites.mjs';
import { matchProbe } from './match.mjs';
import { planRules } from './rules.mjs';
import { claimDepth, redirectTemplate, zoneSpec } from './zones.mjs';

const ENTRY_KEYS = ['id', 'mode', 'origin', 'paths', 'repo'];

/** Shape-only check mirroring the schema: the committed file is `{ $schema?, entries }`, entries have exactly the five keys. */
function shapeErrors(doc: Record<string, unknown>): string[] {
  const errors = Object.keys(doc)
    .filter((k) => k !== '$schema' && k !== 'entries')
    .map((k) => `unknown top-level key ${k}`);
  const entries = doc.entries;
  if (!Array.isArray(entries)) return [...errors, 'entries is not an array'];
  for (const e of entries as Record<string, unknown>[]) {
    if (Object.keys(e).sort().join() !== ENTRY_KEYS.join()) errors.push(`entry ${String(e.id)} keys`);
    if (e.mode !== 'proxy' && e.mode !== 'redirect') errors.push(`entry ${String(e.id)} mode`);
    if (!Array.isArray(e.paths) || e.paths.length === 0) errors.push(`entry ${String(e.id)} paths`);
  }
  return errors;
}

describe('legacy.json', () => {
  it('holds the ADR 0002 D6.4 rules 6-11, each { id, repo, mode, origin, paths[] }', () => {
    expect(shapeErrors(legacy)).toEqual([]);
    expect(legacy.entries.map((e) => e.id)).toEqual([
      'legacy-ocx-dirs',
      'legacy-ocx-files',
      'legacy-catalog',
      'legacy-rules-ocx',
      'legacy-find-ocx',
      'legacy-ocx-sdk-python',
      'legacy-index',
    ]);
  });

  it('a planted registry key fails the shape check and the schema forbids it', () => {
    expect(shapeErrors({ ...legacy, registry: { origin: 'https://r.example' } })).toEqual([
      'unknown top-level key registry',
    ]);
    expect(schema.additionalProperties).toBe(false);
    expect(Object.keys(schema.properties)).not.toContain('registry');
  });
});

type Schema = {
  type?: string;
  enum?: unknown[];
  pattern?: string;
  minItems?: number;
  required?: string[];
  additionalProperties?: boolean;
  properties?: Record<string, Schema>;
  items?: Schema;
};

/** The subset of JSON Schema legacy.schema.json uses, so the committed schema itself is what rejects bad data. */
function validate(value: unknown, s: Schema, at = '$'): string[] {
  const errors: string[] = [];
  if (s.enum && !s.enum.includes(value)) errors.push(`${at} not in enum`);
  if (s.type === 'string') {
    if (typeof value !== 'string') return [`${at} not a string`];
    if (s.pattern && !new RegExp(s.pattern).test(value)) errors.push(`${at} fails ${s.pattern}`);
  }
  if (s.type === 'array') {
    if (!Array.isArray(value)) return [`${at} not an array`];
    if (s.minItems !== undefined && value.length < s.minItems) errors.push(`${at} too short`);
    if (s.items) value.forEach((v, i) => errors.push(...validate(v, s.items as Schema, `${at}[${i}]`)));
  }
  if (s.type === 'object') {
    if (typeof value !== 'object' || value === null) return [`${at} not an object`];
    const obj = value as Record<string, unknown>;
    for (const k of s.required ?? []) if (!(k in obj)) errors.push(`${at}.${k} missing`);
    for (const [k, v] of Object.entries(obj)) {
      const sub = s.properties?.[k];
      if (sub) errors.push(...validate(v, sub, `${at}.${k}`));
      else if (s.additionalProperties === false) errors.push(`${at}.${k} not allowed`);
    }
  }
  return errors;
}

describe('legacy.schema.json (C-314)', () => {
  const entry = legacy.entries[0];
  const check = (doc: unknown) => validate(doc, schema);

  it('accepts the committed file', () => {
    expect(check(legacy)).toEqual([]);
  });

  it('rejects a planted registry key', () => {
    expect(check({ ...legacy, registry: { origin: 'https://r.example' } })).toEqual(['$.registry not allowed']);
  });

  it.each([
    ['an extra entry key', { ...entry, extra: 1 }],
    ['an unknown mode', { ...entry, mode: 'rewrite' }],
    ['a non-https origin', { ...entry, origin: 'http://ocx-website.pages.dev' }],
    ['a relative path', { ...entry, paths: ['docs/'] }],
    ['no paths', { ...entry, paths: [] }],
    ['a repo without an owner', { ...entry, repo: 'ocx' }],
    ['an upper-case id', { ...entry, id: 'Legacy' }],
  ])('rejects %s', (_name, bad) => {
    expect(check({ entries: [bad] })).not.toEqual([]);
  });
});

describe('legacy.json against nav.json and the redirect mapping (C-314)', () => {
  const claims = nav.claims as { path: string; repo: string }[];

  it('ids are unique', () => {
    const ids = legacy.entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every entry repo owns a claim in nav.json, and a redirect starts at that claim', () => {
    for (const e of legacy.entries) {
      const owned = claims.filter((c) => c.repo === e.repo).map((c) => c.path);
      expect(owned, e.id).not.toEqual([]);
      if (e.mode === 'redirect') expect(owned, e.id).toContain(e.paths[0]);
    }
  });

  it('a redirect origin ends in / and its paths share one claim depth', () => {
    for (const e of legacy.entries.filter((x) => x.mode === 'redirect')) {
      expect(e.origin.endsWith('/'), e.id).toBe(true);
      expect(new Set(e.paths.map(claimDepth)).size, e.id).toBe(1);
    }
  });

  it('maps <claim>...rest to <origin><rest> with %{Path.N-}, N = claim depth', () => {
    const template = (id: string) =>
      redirectTemplate(legacy.entries.find((e) => e.id === id) as (typeof legacy.entries)[number]);
    expect(template('legacy-catalog')).toBe('https://ocx-sh.github.io/catalog/%{Path.2-}');
    expect(template('legacy-rules-ocx')).toBe('https://ocx-sh.github.io/rules_ocx/%{Path.2-}');
    expect(template('legacy-ocx-sdk-python')).toBe('https://ocx-sh.github.io/ocx-sdk-python/%{Path.2-}');
    expect(template('legacy-index')).toBe('https://index.ocx.sh/%{Path.1-}');
  });

  it('refuses a proxy entry, which has no redirect target', () => {
    expect(() => redirectTemplate(legacy.entries[0] as (typeof legacy.entries)[number])).toThrow(/redirect/);
  });
});

describe('matchProbe', () => {
  const prod = planRules('prod');
  const at = (host: string, path: string, status = 200) => matchProbe(prod, { host, path, status });

  it('/apps/catalog/x/ wins legacy-catalog, never legacy-index', () => {
    expect(at('ocx.sh', '/apps/catalog/x/').origin).toBe('legacy-catalog');
    expect(at('ocx.sh', '/catalog/x/').origin).toBe('legacy-index');
  });

  it('a path no origin rule claims wins none', () => {
    expect(at('ocx.sh', '/v2/').origin).toBeNull();
  });

  it('header rules stack and depend on host', () => {
    expect(at('sh-ocx.b-cdn.net', '/').headers).toEqual(['noindex', 'frame']);
    expect(at('ocx.sh', '/').headers).toEqual(['hsts', 'frame']);
  });

  it('a StatusCode trigger matches only its status', () => {
    expect(at('ocx.sh', '/_astro/x.js', 200).headers).toEqual(['assets-edge', 'assets-browser', 'hsts', 'frame']);
    expect(at('ocx.sh', '/_astro/x.js', 404).headers).toEqual(['hsts', 'frame']);
  });
});

describe('zoneSpec (C-311 host sets, ADR 0002 D6.2)', () => {
  it('names the dev, prod and preview zones with their literal hosts', () => {
    expect(zoneSpec('dev')).toMatchObject({
      pull: 'sh-ocx-dev',
      storage: 'sh-ocx-website',
      hosts: ['sh-ocx-dev.b-cdn.net'],
    });
    expect(zoneSpec('prod')).toMatchObject({
      pull: 'sh-ocx',
      storage: 'sh-ocx-website',
      hosts: ['ocx.sh', 'next.ocx.sh', 'sh-ocx.b-cdn.net'],
    });
    expect(zoneSpec('preview:ocx')).toMatchObject({
      pull: 'sh-ocx-preview-ocx',
      storage: 'sh-ocx-preview-ocx',
      hosts: ['sh-ocx-preview-ocx.b-cdn.net'],
    });
  });

  it('names a preview zone for every site slug, as the deploy and onboard name it', () => {
    for (const site of SITES) {
      const { pull, storage, hosts } = zoneSpec(`preview:${slug(site)}`);
      expect([pull, storage, hosts]).toEqual([
        previewZone(site),
        previewZone(site),
        [`${previewZone(site)}.b-cdn.net`],
      ]);
    }
  });

  it.each(['staging', 'preview:', 'preview:Bad Slug', 'preview:a/b', 'preview:nope', 'preview:rules_ocx'])(
    'rejects %s',
    (z) => {
      expect(() => zoneSpec(z)).toThrow(/zone/);
    },
  );
});
