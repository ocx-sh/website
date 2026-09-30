// Contracts C-001…C-006, C-008, C-009 on the path registry (registry.mjs + nav.json).
import { readdirSync, readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import navJson from '../src/nav.json' with { type: 'json' };
import schema from '../src/nav.schema.json' with { type: 'json' };
import { ROOT_DIRS, claimFor, claimsOf, mergeTargets, validate, zoneName } from '../src/registry.mjs';
import type { Nav, Problem } from '../src/registry.mjs';

const nav: Nav = navJson;
const clone = (): Nav => structuredClone(nav);

/** `nav` plus one probe claim; returns the nav and the probe's index. */
function withClaim(path: string, repo = 'ocx-sh/probe'): [Nav, number] {
  const n = clone();
  return [n, n.claims.push({ path, repo, search: false }) - 1];
}

const at = (problems: Problem[], index: number) => problems.filter((p) => p.at.startsWith(`claims[${index}]`));
const withPrefix = (problems: Problem[], prefix: string) => problems.filter((p) => p.message.startsWith(`${prefix}:`));

// Fixture file name: `<contract>--<message prefix>--<defect>.json`, one defect each.
const FIXTURES = new URL('fixtures/nav-invalid/', import.meta.url);
const fixtures = readdirSync(FIXTURES)
  .filter((f) => f.endsWith('.json'))
  .map((file) => {
    const [contract, prefix, defect] = file.slice(0, -'.json'.length).split('--') as [string, string, string];
    return { file, contract, prefix, defect, nav: JSON.parse(readFileSync(new URL(file, FIXTURES), 'utf8')) as Nav };
  });

function fixtureCases(contract: string) {
  const own = fixtures.filter((f) => f.contract === contract);
  it(`${contract}: has at least one invalid fixture`, () => {
    expect(own.length).toBeGreaterThan(0);
  });
  it.each(own.map((f) => [f.defect, f.prefix, f.nav] as const))(
    `${contract}: fixture %s → %s problem`,
    (_, prefix, n) => {
      expect(withPrefix(validate(n), prefix)).not.toEqual([]);
    },
  );
}

describe('C-001 nav.json is valid', () => {
  const ajv = new Ajv2020({ strict: true, allErrors: true });

  it('C-001: nav.schema.json compiles strict and accepts nav.json', () => {
    const check = ajv.compile(schema);
    expect(check(nav), JSON.stringify(check.errors)).toBe(true);
  });

  it('C-001: validate(nav) returns no problems', () => {
    expect(validate(nav)).toEqual([]);
  });

  it('C-001: every fixture file follows the naming scheme', () => {
    for (const f of fixtures) {
      expect(f.contract, f.file).toMatch(/^C-00[2-6]$/);
      expect(f.prefix, f.file).toMatch(/^(R[1-8]|C-00[4-6])$/);
      expect(f.defect, f.file).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it.each(fixtures.map((f) => [f.file, f.nav] as const))('C-001: fixture %s yields at least one problem', (_, n) => {
    expect(validate(n).length).toBeGreaterThan(0);
  });
});

describe('C-002 path grammar', () => {
  it.each(['/', '/docs/', '/integrations/bazel/'])('C-002: accepts %s', (path) => {
    expect(nav.claims.map((c) => c.path)).toContain(path);
    expect(validate(nav)).toEqual([]);
  });

  it('C-002: accepts a 32-char slug', () => {
    const [n] = withClaim(`/integrations/${'a'.repeat(15)}-${'b'.repeat(16)}/`);
    expect(validate(n)).toEqual([]);
  });

  it.each([
    ['/docs', 'R1'],
    ['/Docs/', 'R1'],
    ['/docs/sub/', 'R4'],
  ])('C-002: rejects %s with %s', (path, prefix) => {
    const [n, i] = withClaim(path);
    expect(withPrefix(at(validate(n), i), prefix)).not.toEqual([]);
  });

  it.each([
    '/foo/',
    '/integrations/a_b/',
    `/integrations/${'a'.repeat(33)}/`,
    '/integrations/-a/',
    '/integrations/a--b/',
  ])('C-002: rejects %s', (path) => {
    const [n, i] = withClaim(path);
    expect(at(validate(n), i)).not.toEqual([]);
  });

  fixtureCases('C-002');
});

describe('C-003 reserved segments', () => {
  const RESERVED = [
    '_astro',
    'pagefind',
    'artifactory',
    'bunnycdn_errors',
    '.well-known',
    'api',
    'lore',
    'team',
    'preview',
  ];
  const VERSIONS = ['v2', 'v1.3', 'v10'];
  it.each([...RESERVED, ...VERSIONS])('C-003: rejects %s as top', (seg) => {
    const [n, i] = withClaim(`/${seg}/`);
    expect(withPrefix(at(validate(n), i), 'R8')).not.toEqual([]);
  });

  it.each([...RESERVED, ...VERSIONS])('C-003: rejects %s as slug', (seg) => {
    const [n, i] = withClaim(`/apps/${seg}/`);
    expect(withPrefix(at(validate(n), i), 'R8')).not.toEqual([]);
  });

  it.each(['v', 'v2x', 'version', 'dev2'])('C-003: accepts non-version slug %s', (seg) => {
    const [n] = withClaim(`/apps/${seg}/`);
    expect(validate(n)).toEqual([]);
  });

  fixtureCases('C-003');
});

describe('C-004 claim uniqueness and nesting', () => {
  it('C-004: rejects a duplicate claim path', () => {
    const [n] = withClaim('/integrations/bazel/', 'ocx-sh/rules_ocx');
    expect(withPrefix(validate(n), 'C-004')).not.toEqual([]);
  });

  it.each([
    '/docs/sub/',
    '/catalog/sub/',
    '/install/sub/',
    '/schemas/sub/',
    '/integrations/bazel/sub/',
    '/apps/catalog/sub/',
  ])('C-004: rejects %s nested under a non-hub claim', (path) => {
    const [n, i] = withClaim(path);
    expect(withPrefix(at(validate(n), i), 'R4')).not.toEqual([]);
  });

  it('C-004: ROOT_DIRS is exactly /_astro/ and /pagefind/, frozen', () => {
    expect(ROOT_DIRS).toEqual(['/_astro/', '/pagefind/']);
    expect(Object.isFrozen(ROOT_DIRS)).toBe(true);
  });

  it.each(['/_astro/app.js', '/pagefind/pagefind.js', '/favicon.ico', '/404.html'])(
    'C-004: root claim owns %s',
    (path) => {
      expect(claimFor(nav, path)?.path).toBe('/');
    },
  );

  fixtureCases('C-004');
});

describe('C-005 repos and zones', () => {
  it.each(['acme/foo', 'ocx-sh/', 'ocx-sh/foo bar', 'ocx-sh/foo/bar', 'OCX-SH/foo', 'ocx-sh/föo', ' ocx-sh/foo'])(
    'C-005: rejects repo %j',
    (repo) => {
      const [n] = withClaim('/integrations/probe/', repo);
      expect(withPrefix(validate(n), 'C-005')).not.toEqual([]);
    },
  );

  it.each([
    ['ocx-sh/rules_ocx', 'sh-ocx-web-rules-ocx'],
    ['ocx-sh/ocx-sdk.python', 'sh-ocx-web-ocx-sdk-python'],
    ['ocx-sh/Website', 'sh-ocx-web-website'],
    ['ocx-sh/ocx', 'sh-ocx-web-ocx'],
  ])('C-005: zoneName(%s) = %s', (repo, zone) => {
    expect(zoneName(repo)).toBe(zone);
  });

  it('C-005: rejects two repos mapping to one zone (ocx-sh/a_b vs ocx-sh/a.b)', () => {
    const [n] = withClaim('/integrations/ab/', 'ocx-sh/a_b');
    n.claims.push({ path: '/apps/ab/', repo: 'ocx-sh/a.b', search: false });
    expect(withPrefix(validate(n), 'C-005')).not.toEqual([]);
  });

  it('C-005: one repo may own several claims', () => {
    const [n] = withClaim('/apps/rules/', 'ocx-sh/rules_ocx');
    expect(validate(n)).toEqual([]);
  });

  fixtureCases('C-005');
});

describe('C-006 entries, hubs and links', () => {
  fixtureCases('C-006');
});

describe('C-008 pure registry functions', () => {
  it.each([
    ['/', '/'],
    ['/docs/', '/docs/'],
    ['/docs', '/docs/'],
    ['/docs/x/y/', '/docs/'],
    ['/docsx', '/'],
    ['/integrations/', '/integrations/'],
    ['/integrations', '/integrations/'],
    ['/integrations/bazel', '/integrations/bazel/'],
    ['/integrations/bazel/defs/', '/integrations/bazel/'],
    ['/integrations/unknown/', '/integrations/'],
    ['/apps/catalog/x', '/apps/catalog/'],
    ['/catalog/', '/catalog/'],
    ['/unknown/x', '/'],
  ])('C-008: claimFor(%s) → %s', (path, claim) => {
    expect(claimFor(nav, path)?.path).toBe(claim);
  });

  it.each([
    ['ocx-sh/website', ['/', '/integrations/', '/apps/', '/install/']],
    ['ocx-sh/ocx', ['/docs/', '/schemas/']],
    ['ocx-sh/none', []],
  ])('C-008: claimsOf(%s)', (repo, paths) => {
    expect(claimsOf(nav, repo).map((c) => c.path)).toEqual(paths);
  });

  it('C-008: mergeTargets(nav, "/docs/") lists other searchable claims with labels', () => {
    expect(mergeTargets(nav, '/docs/')).toEqual([
      { path: '/', label: 'ocx' },
      { path: '/integrations/bazel/', label: 'Bazel' },
      { path: '/integrations/python/', label: 'Python' },
      { path: '/apps/catalog/', label: 'catalog' },
    ]);
  });

  it('C-008: mergeTargets(nav, "/") excludes root', () => {
    expect(mergeTargets(nav, '/')).toEqual([
      { path: '/docs/', label: 'docs' },
      { path: '/integrations/bazel/', label: 'Bazel' },
      { path: '/integrations/python/', label: 'Python' },
      { path: '/apps/catalog/', label: 'catalog' },
    ]);
  });

  it('C-008: no function mutates a deep-frozen nav', () => {
    const deepFreeze = <T>(o: T): T => {
      if (o && typeof o === 'object') for (const v of Object.values(o)) deepFreeze(v);
      return Object.freeze(o);
    };
    const frozen = deepFreeze(clone());
    validate(frozen);
    claimFor(frozen, '/docs/x/');
    claimsOf(frozen, 'ocx-sh/website');
    mergeTargets(frozen, '/docs/');
    zoneName('ocx-sh/rules_ocx');
    expect(frozen).toEqual(nav);
  });

  it('C-008: registry.mjs source performs no I/O and imports nothing', () => {
    const src = readFileSync(new URL('../src/registry.mjs', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/\bimport\b|\brequire\b|\bfetch\b|\bprocess\b|node:/);
  });
});

describe('C-009 schema version', () => {
  it('C-009: nav.json version equals the schema version const', () => {
    expect(nav.version).toBe(schema.properties.version.const);
  });
});
