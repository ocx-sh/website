// Contracts C-011…C-014 and C-070 on the `ocx-site check` checker (src/check/*, bin/ocx-site.mjs).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import navJson from '../src/nav.json' with { type: 'json' };
import { check, defaultPath } from '../src/check/index.mjs';
import { layoutProblem } from '../src/check/layout.mjs';
import { linkProblem, linkTargets } from '../src/check/links.mjs';
import { PAGEFIND_VERSION, pagefindProblem } from '../src/check/pagefind.mjs';
import { PAGEFIND_VERSION as NAV_PAGEFIND_VERSION } from '../src/nav.mjs';
import type { Nav } from '../src/registry.mjs';

const nav: Nav = navJson;
const WEBSITE = 'ocx-sh/website';
const BAZEL = 'ocx-sh/rules_ocx';
const OCX = 'ocx-sh/ocx';
const THEME = fileURLToPath(new URL('..', import.meta.url));
const BIN = join(THEME, 'bin/ocx-site.mjs');
const fixture = (name: string) => join(THEME, 'test/fixtures', name);
const WEBSITE_OK = fixture('dist-website-ok');
const BAZEL_OK = fixture('dist-bazel-ok');
const WEBSITE_BAD = fixture('dist-website-bad');

/** A fresh temp dir holding `files` (dist-relative path → contents). */
function tmpDist(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'ocx-site-'));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  return dir;
}

const entry = (version: string) => JSON.stringify({ version, languages: {} });
const never = () => vi.fn<(distRelPath: string) => boolean>(() => false);
const always = () => vi.fn<(distRelPath: string) => boolean>(() => true);

/** Env without the ambient repo/git hints, plus `extra`. */
function env(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const e: NodeJS.ProcessEnv = { ...process.env, ...extra };
  for (const k of ['GITHUB_REPOSITORY', 'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']) if (!(k in extra)) delete e[k];
  return e;
}

/** A temp dir no git repo encloses (ceiling set at its parent). */
function nonGitDir(): { cwd: string; env: NodeJS.ProcessEnv } {
  const cwd = mkdtempSync(join(tmpdir(), 'ocx-site-cwd-'));
  return { cwd, env: env({ GIT_CEILING_DIRECTORIES: dirname(cwd) }) };
}

function cli(args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) {
  const r = spawnSync(process.execPath, [BIN, ...args], {
    cwd: opts.cwd ?? THEME,
    env: opts.env ?? env(),
    encoding: 'utf8',
    timeout: 30_000,
  });
  const lines = r.stdout.split('\n').filter((l) => l !== '');
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, lines };
}

const LINE = /^[^\s:][^:]*: \S.*$/;
const expectLines = (lines: string[]) => {
  expect(lines.length).toBeGreaterThan(0);
  for (const l of lines) expect(l).toMatch(LINE);
};

describe('C-013 linkTargets', () => {
  const sorted = (html: string) => linkTargets(html).toSorted();

  it('C-013: collects a double-quoted href', () => {
    expect(linkTargets('<a href="/a/">a</a>')).toEqual(['/a/']);
  });

  it('C-013: strips hash and query', () => {
    expect(sorted('<a href="/a/?q=1#h">a</a><a href="/b#x">b</a><a href="/c?x=1">c</a>')).toEqual(['/a/', '/b', '/c']);
  });

  it('C-013: collects src and every srcset candidate', () => {
    expect(sorted('<img src="/c.png" srcset="/a.png 1x, /b.png 2x" alt="">')).toEqual(['/a.png', '/b.png', '/c.png']);
  });

  it('C-013: collects srcset candidates without descriptors and with w descriptors', () => {
    expect(sorted('<img srcset="/a.png,/b.png 640w" alt="">')).toEqual(['/a.png', '/b.png']);
  });

  it('C-013: reads single-quoted and unquoted attributes', () => {
    expect(sorted(`<a href='/s/'>s</a><a href=/u/>u</a>`)).toEqual(['/s/', '/u/']);
  });

  it('C-013: decodes &amp;', () => {
    expect(linkTargets('<a href="/docs/a&amp;b/">x</a>')).toEqual(['/docs/a&b/']);
  });

  it('C-013: keeps percent-encoding as written', () => {
    expect(linkTargets('<link href="/_astro/a%20b.css">')).toEqual(['/_astro/a%20b.css']);
  });

  it('C-013: resolves dot segments, %2e%2e and backslashes like a browser', () => {
    expect(
      sorted(
        '<a href="/_astro/../foo/">a</a><a href="/integrations/bazel/../outside/x">b</a><a href="/a/%2e%2e/b/./c">c</a><a href="/d\\e">d</a>',
      ),
    ).toEqual(['/b/c', '/d/e', '/foo/', '/integrations/outside/x']);
  });

  it('C-013: ignores a backslash protocol-relative URL', () => {
    expect(linkTargets('<a href="/\\evil.example/x">x</a>')).toEqual([]);
  });

  it('C-013: yields no target for a data: srcset candidate', () => {
    expect(linkTargets('<img srcset="data:image/jpeg;base64,/9j/4AAQ 1x, /b.png 2x" alt="">')).toEqual(['/b.png']);
  });

  it('C-013: ignores protocol-relative, absolute, relative, fragment and mailto URLs', () => {
    const html =
      '<a href="//cdn.example.com/x">1</a><a href="https://x.dev/">2</a><a href="rel/p">3</a><a href="#f">4</a><a href="mailto:a@b">5</a>';
    expect(linkTargets(html)).toEqual([]);
  });
});

describe('C-013 linkProblem', () => {
  it.each(['/robots.txt', '/_astro/x.css', '/pagefind/pagefind.js', '/_astro', '/', '/foo'])(
    'C-013: %s under the root claim is allowed',
    (t) => {
      expect(linkProblem(nav, BAZEL, '/integrations/bazel/', t, never())).toBeUndefined();
    },
  );

  it.each(['/foo/', '/foo/bar.html'])('C-013: %s (a root-claim dir outside ROOT_DIRS) is a problem', (t) => {
    const problem = linkProblem(nav, BAZEL, '/integrations/bazel/', t, always());
    expect(problem).toBeTypeOf('string');
    expect(problem).toContain(t);
  });

  it('C-013: a root-claim dir outside ROOT_DIRS is a problem even for the root owner', () => {
    expect(linkProblem(nav, WEBSITE, '/', '/foo/', always())).toContain('/foo/');
  });

  it("C-013: a link into another repo's claim passes without an existence check", () => {
    const exists = never();
    expect(linkProblem(nav, WEBSITE, '/', '/docs/x/', exists)).toBeUndefined();
    expect(linkProblem(nav, WEBSITE, '/', '/integrations/bazel/nope/', exists)).toBeUndefined();
    expect(exists).not.toHaveBeenCalled();
  });

  it('C-013: /docs without a trailing slash resolves to the ocx claim', () => {
    const exists = never();
    expect(linkProblem(nav, WEBSITE, '/', '/docs', exists)).toBeUndefined();
    expect(exists).not.toHaveBeenCalled();
  });

  it("C-013: a link to the repo's own claim outside --path passes without an existence check", () => {
    const exists = never();
    expect(linkProblem(nav, OCX, '/docs/', '/schemas/v1.json', exists)).toBeUndefined();
    expect(exists).not.toHaveBeenCalled();
  });

  it('C-013: a missing target under the own claim is a problem naming the URL', () => {
    const exists = never();
    expect(linkProblem(nav, BAZEL, '/integrations/bazel/', '/integrations/bazel/missing/', exists)).toContain(
      '/integrations/bazel/missing/',
    );
    expect(exists).toHaveBeenCalled();
  });

  it('C-013: an existing target under the own claim passes', () => {
    const exists = always();
    expect(linkProblem(nav, BAZEL, '/integrations/bazel/', '/integrations/bazel/guide/', exists)).toBeUndefined();
    expect(exists).toHaveBeenCalled();
  });

  it('C-013: the own claim without its trailing slash is checked for existence', () => {
    expect(linkProblem(nav, OCX, '/docs/', '/docs', never())).toBeTypeOf('string');
    expect(linkProblem(nav, OCX, '/docs/', '/docs', always())).toBeUndefined();
  });

  it('C-013: the existence check receives the percent-decoded dist-relative path', () => {
    const exists = always();
    expect(
      linkProblem(nav, BAZEL, '/integrations/bazel/', '/integrations/bazel/_astro/a%20b.css', exists),
    ).toBeUndefined();
    expect(exists).toHaveBeenCalledWith('_astro/a b.css');
  });
});

describe('C-014 layoutProblem', () => {
  it.each([
    'index.html',
    '404.html',
    'robots.txt',
    '_astro/x.css',
    'pagefind/pagefind.js',
    'pagefind/fragment/a.pf_fragment',
    'integrations/index.html',
    'install/index.html',
  ])('C-014: website at / may ship %s', (rel) => {
    expect(layoutProblem(nav, WEBSITE, '/', rel)).toBeUndefined();
  });

  it.each(['integrations/bazel/index.html', 'foo/index.html', 'docs/index.html'])(
    'C-014: website at / may not ship %s',
    (rel) => {
      expect(layoutProblem(nav, WEBSITE, '/', rel)).toBeTypeOf('string');
    },
  );

  it.each(['index.html', '_astro/x.css', 'pagefind/pagefind-entry.json', 'guide/index.html'])(
    'C-014: rules_ocx at /integrations/bazel/ may ship %s',
    (rel) => {
      expect(layoutProblem(nav, BAZEL, '/integrations/bazel/', rel)).toBeUndefined();
    },
  );

  it('C-014: files map onto --path, so website at /integrations/ may not ship bazel/…', () => {
    expect(layoutProblem(nav, WEBSITE, '/integrations/', 'index.html')).toBeUndefined();
    expect(layoutProblem(nav, WEBSITE, '/integrations/', 'bazel/index.html')).toBeTypeOf('string');
  });
});

describe('C-070 pagefindProblem', () => {
  it('C-070: PAGEFIND_VERSION is a semver literal', () => {
    expect(PAGEFIND_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('C-070: a matching entry passes', () => {
    expect(pagefindProblem(entry(PAGEFIND_VERSION))).toBeUndefined();
  });

  it('C-070: a version mismatch names both versions', () => {
    const problem = pagefindProblem(entry('1.4.0'));
    expect(problem).toContain('1.4.0');
    expect(problem).toContain(PAGEFIND_VERSION);
  });

  it.each([
    ['missing', undefined],
    ['unparsable', 'not json'],
    ['versionless', '{}'],
    ['non-string version', '{"version":152}'],
  ])('C-070: a %s entry is a problem', (_, text) => {
    expect(pagefindProblem(text)).toBeTypeOf('string');
  });
});

describe('C-070 PAGEFIND_VERSION', () => {
  it('C-070: ./nav re-exports PAGEFIND_VERSION', () => {
    expect(NAV_PAGEFIND_VERSION).toBe(PAGEFIND_VERSION);
  });

  it('C-070: check/pagefind.mjs is node-free (no import of any kind)', () => {
    const src = readFileSync(join(THEME, 'src/check/pagefind.mjs'), 'utf8');
    expect(src).not.toMatch(/^\s*import[\s{*'"]/m);
    expect(src).not.toMatch(/\bimport\s*\(/);
    expect(src).not.toMatch(/^\s*export\s[^;]*\bfrom\s*['"]/m);
    expect(src).not.toMatch(/\brequire\s*\(/);
  });

  it('C-070: equals the pagefind version installed under @astrojs/starlight', () => {
    // Neither package exports ./package.json, so find each package dir on createRequire's lookup paths.
    const pkgDir = (from: string, name: string) => {
      const dir = createRequire(from)
        .resolve.paths(name)
        ?.map((p) => join(p, name))
        .find((p) => existsSync(join(p, 'package.json')));
      if (dir === undefined) throw new Error(`${name} not found from ${from}`);
      return realpathSync(dir);
    };
    const starlight = pkgDir(join(THEME, 'package.json'), '@astrojs/starlight');
    const pagefind = pkgDir(join(starlight, 'package.json'), 'pagefind');
    const pkg: unknown = JSON.parse(readFileSync(join(pagefind, 'package.json'), 'utf8'));
    expect(pkg).toHaveProperty('version', PAGEFIND_VERSION);
  });
});

describe('C-012 defaultPath', () => {
  it.each([
    [WEBSITE, '/'],
    [BAZEL, '/integrations/bazel/'],
    [OCX, '/docs/'],
    ['ocx-sh/nobody', undefined],
  ])('C-012: %s deploys to %j by default', (repo, path) => {
    expect(defaultPath(nav, repo)).toBe(path);
  });

  it('C-012: several claims → the shortest, not the first', () => {
    const n = structuredClone(nav);
    n.claims.push(
      { path: '/apps/p/', repo: 'ocx-sh/probe', search: false },
      { path: '/install/x/', repo: 'ocx-sh/probe', search: false },
    );
    n.claims.push({ path: '/schemas/p/', repo: 'ocx-sh/probe', search: false });
    expect(defaultPath(n, 'ocx-sh/probe')).toBe('/apps/p/');
    n.claims.unshift({ path: '/integrations/probe-long/', repo: 'ocx-sh/probe', search: false });
    expect(defaultPath(n, 'ocx-sh/probe')).toBe('/apps/p/');
  });
});

describe('C-011 check()', () => {
  it('C-011: website clean dist passes at the default path', () => {
    expect(check({ dist: WEBSITE_OK, nav, repo: WEBSITE })).toEqual([]);
  });

  it('C-011: website clean dist passes at an explicit --path /', () => {
    expect(check({ dist: WEBSITE_OK, nav, repo: WEBSITE, path: '/' })).toEqual([]);
  });

  it('C-011: rules_ocx clean dist passes at /integrations/bazel/', () => {
    expect(check({ dist: BAZEL_OK, nav, repo: BAZEL })).toEqual([]);
    expect(check({ dist: BAZEL_OK, nav, repo: BAZEL, path: '/integrations/bazel/' })).toEqual([]);
  });

  it('C-011: problems are sorted by file then problem', () => {
    const problems = check({ dist: WEBSITE_BAD, nav, repo: WEBSITE });
    const key = (p: { file: string; problem: string }) => [p.file, p.problem] as const;
    const sorted = problems.toSorted((a, b) => {
      const [fa, pa] = key(a);
      const [fb, pb] = key(b);
      return fa < fb ? -1 : fa > fb ? 1 : pa < pb ? -1 : pa > pb ? 1 : 0;
    });
    expect(problems.length).toBeGreaterThan(0);
    expect(problems).toEqual(sorted);
  });

  it('C-012: an unclaimed repo yields one nav.json problem saying how to claim', () => {
    const problems = check({ dist: WEBSITE_OK, nav, repo: 'ocx-sh/nobody' });
    expect(problems).toHaveLength(1);
    expect(problems[0]?.file).toBe('nav.json');
    expect(problems[0]?.problem).toContain('ocx-sh/nobody');
    expect(problems[0]?.problem).toContain('ocx-sh/website');
    expect(problems[0]?.problem).toMatch(/claims/);
  });

  it('C-012: a --path the repo does not own yields one nav.json problem listing its claims', () => {
    const problems = check({ dist: WEBSITE_OK, nav, repo: WEBSITE, path: '/docs/' });
    expect(problems).toHaveLength(1);
    expect(problems[0]?.file).toBe('nav.json');
    for (const p of ['/', '/integrations/', '/apps/', '/install/']) expect(problems[0]?.problem).toContain(p);
  });
});

describe('C-013/C-014/C-070 check() on a failing website dist', () => {
  const problems = () => check({ dist: WEBSITE_BAD, nav, repo: WEBSITE });
  const of = (file: string) => problems().filter((p) => p.file === file);

  it('C-014: integrations/bazel/ in website dist fails', () => {
    expect(of('integrations/bazel/index.html')).toHaveLength(1);
  });

  it('C-014: a top-level foo/ in website dist fails', () => {
    expect(of('foo/index.html')).toHaveLength(1);
  });

  it('C-014: _astro/ and pagefind/ in website dist pass the layout check', () => {
    expect(of('_astro/x.css')).toEqual([]);
  });

  it('C-013: every bad link in index.html is reported once, naming its URL, and no good link is', () => {
    const bad = ['/foo/', '/install/missing/', '/_astro/gone-src.css', '/_astro/gone-srcset.css'];
    const own = of('index.html');
    expect(own).toHaveLength(bad.length);
    for (const url of bad) expect(own.filter((p) => p.problem.includes(url))).toHaveLength(1);
  });

  it('C-070: a pagefind version mismatch fails naming both versions', () => {
    const own = of('pagefind/pagefind-entry.json');
    expect(own).toHaveLength(1);
    expect(own[0]?.problem).toContain('1.4.0');
    expect(own[0]?.problem).toContain(PAGEFIND_VERSION);
  });
});

describe('C-013/C-070 check() on temp dists', () => {
  const page = '<!doctype html><title>x</title>';

  it('C-013: a dir with index.html satisfies a link; a dir without one does not', () => {
    const dist = tmpDist({
      'index.html': '<a href="/integrations/">a</a><a href="/apps/">b</a>',
      'integrations/index.html': page,
      'apps/other.html': page,
      'pagefind/pagefind-entry.json': entry(PAGEFIND_VERSION),
    });
    const problems = check({ dist, nav, repo: WEBSITE });
    expect(problems).toHaveLength(1);
    expect(problems[0]?.file).toBe('index.html');
    expect(problems[0]?.problem).toContain('/apps/');
  });

  it('C-013: a percent-encoded link resolves to the decoded file name', () => {
    const dist = tmpDist({
      'index.html': '<link href="/integrations/bazel/_astro/a%20b.css">',
      '_astro/a b.css': 'body{}',
      'pagefind/pagefind-entry.json': entry(PAGEFIND_VERSION),
    });
    expect(check({ dist, nav, repo: BAZEL })).toEqual([]);
  });

  it('C-013: /_astro/../foo/ fails as the root-claim dir /foo/', () => {
    const dist = tmpDist({
      'index.html': '<a href="/_astro/../foo/">x</a>',
      'foo/index.html': page,
      'pagefind/pagefind-entry.json': entry(PAGEFIND_VERSION),
    });
    expect(
      check({ dist, nav, repo: WEBSITE })
        .filter((p) => p.file === 'index.html')
        .map((p) => p.problem),
    ).toEqual([expect.stringContaining('/foo/')]);
  });

  it('C-013: /integrations/bazel/../outside/x and %2f.. never probe outside dist', () => {
    const exists = always();
    expect(linkProblem(nav, BAZEL, '/integrations/bazel/', '/integrations/outside/x', exists)).toBeUndefined();
    expect(linkProblem(nav, BAZEL, '/integrations/bazel/', '/integrations/bazel/..%2f..%2fx', exists)).toContain(
      'escapes',
    );
    expect(exists).not.toHaveBeenCalled();
  });

  it('C-013: link problems in a nested page name that page', () => {
    const dist = tmpDist({
      'index.html': page,
      'guide/index.html': '<a href="/integrations/bazel/nope/">x</a>',
      'pagefind/pagefind-entry.json': entry(PAGEFIND_VERSION),
    });
    const problems = check({ dist, nav, repo: BAZEL });
    expect(problems).toHaveLength(1);
    expect(problems[0]?.file).toBe('guide/index.html');
  });

  it('C-070: a search claim without pagefind-entry.json fails', () => {
    const problems = check({ dist: tmpDist({ 'index.html': page }), nav, repo: BAZEL });
    expect(problems).toHaveLength(1);
    expect(problems[0]?.problem).toMatch(/pagefind/);
  });

  it('C-070: a non-search claim (ocx /schemas/) ignores pagefind', () => {
    const dist = tmpDist({ 'v1.json': '{}', 'pagefind/pagefind-entry.json': entry('0.0.1') });
    expect(check({ dist, nav, repo: OCX, path: '/schemas/' })).toEqual([]);
    expect(check({ dist: tmpDist({ 'v1.json': '{}' }), nav, repo: OCX, path: '/schemas/' })).toEqual([]);
  });
});

describe('C-011 CLI', () => {
  it('C-011: website clean dist exits 0 with no output', () => {
    const r = cli(['check', '--dist', WEBSITE_OK, '--repo', WEBSITE]);
    expect(r.stdout).toBe('');
    expect(r.code).toBe(0);
  });

  it('C-011: --repo defaults to GITHUB_REPOSITORY', () => {
    const r = cli(['check', '--dist', BAZEL_OK], { env: env({ GITHUB_REPOSITORY: BAZEL }) });
    expect(r.stdout).toBe('');
    expect(r.code).toBe(0);
  });

  it('C-011: --repo falls back to the origin remote', () => {
    const { cwd, env: e } = nonGitDir();
    for (const args of [
      ['init', '-q'],
      ['remote', 'add', 'origin', 'git@github.com:ocx-sh/rules_ocx.git'],
    ]) {
      expect(spawnSync('git', args, { cwd, env: e }).status).toBe(0);
    }
    const r = cli(['check', '--dist', BAZEL_OK], { cwd, env: e });
    expect(r.stdout).toBe('');
    expect(r.code).toBe(0);
  });

  it('C-011: an empty GITHUB_REPOSITORY falls back to the origin remote', () => {
    const { cwd, env: e } = nonGitDir();
    for (const args of [
      ['init', '-q'],
      ['remote', 'add', 'origin', 'https://github.com/ocx-sh/rules_ocx.git'],
    ]) {
      expect(spawnSync('git', args, { cwd, env: e }).status).toBe(0);
    }
    const r = cli(['check', '--dist', BAZEL_OK], { cwd, env: { ...e, GITHUB_REPOSITORY: '' } });
    expect(r.stdout).toBe('');
    expect(r.code).toBe(0);
  });

  it('C-011: --dist defaults to ./dist relative to cwd', () => {
    const cwd = tmpDist({
      'dist/index.html': '<!doctype html><title>x</title>',
      'dist/pagefind/pagefind-entry.json': entry(PAGEFIND_VERSION),
    });
    const r = cli(['check', '--repo', BAZEL], { cwd });
    expect(r.stdout).toBe('');
    expect(r.code).toBe(0);
  });

  it('C-011: a failing dist exits 1 with one <file>: <problem> line per problem on stdout', () => {
    const r = cli(['check', '--dist', WEBSITE_BAD, '--repo', WEBSITE]);
    expect(r.code).toBe(1);
    expectLines(r.lines);
    expect(r.lines).toHaveLength(check({ dist: WEBSITE_BAD, nav, repo: WEBSITE }).length);
    expect(r.lines.some((l) => l.startsWith('foo/index.html: '))).toBe(true);
    expect(r.lines.some((l) => l.startsWith('integrations/bazel/index.html: '))).toBe(true);
    expect(r.lines.some((l) => l.startsWith('index.html: ') && l.includes('/foo/'))).toBe(true);
    expect(
      r.lines.some(
        (l) => l.startsWith('pagefind/pagefind-entry.json: ') && l.includes('1.4.0') && l.includes(PAGEFIND_VERSION),
      ),
    ).toBe(true);
  });

  it('C-012: an unclaimed repo exits 1 with a nav.json line saying how to claim', () => {
    const r = cli(['check', '--dist', WEBSITE_OK, '--repo', 'ocx-sh/nobody']);
    expect(r.code).toBe(1);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]).toMatch(/^nav\.json: .*ocx-sh\/nobody/);
    expect(r.lines[0]).toContain('ocx-sh/website');
  });

  it('C-012: a --path the repo does not own exits 1 with a nav.json line', () => {
    const r = cli(['check', '--dist', WEBSITE_OK, '--repo', WEBSITE, '--path', '/docs/']);
    expect(r.code).toBe(1);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]).toMatch(/^nav\.json: /);
  });

  it.each([
    ['no subcommand', []],
    ['an unknown subcommand', ['lint']],
    ['an unknown flag', ['check', '--dist', WEBSITE_OK, '--repo', WEBSITE, '--bogus']],
    ['a positional', ['check', '--dist', WEBSITE_OK, '--repo', WEBSITE, 'extra']],
    ['--help', ['check', '--help']],
    ['a missing --dist', ['check', '--dist', join(WEBSITE_OK, 'nope'), '--repo', WEBSITE]],
    ['a --dist that is a file', ['check', '--dist', join(WEBSITE_OK, 'index.html'), '--repo', WEBSITE]],
    ['a flag without its value', ['check', '--dist', WEBSITE_OK, '--repo']],
  ])('C-011: %s exits 2 with usage on stderr', (_, args) => {
    const r = cli(args);
    expect(r.code).toBe(2);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain('usage:');
  });

  it('C-011: an unresolvable repo (no flag, no env, no git) exits 2', () => {
    const { cwd, env: e } = nonGitDir();
    const r = cli(['check', '--dist', WEBSITE_OK], { cwd, env: e });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('usage:');
  });

  it('C-011: a default ./dist missing from cwd exits 2', () => {
    const { cwd, env: e } = nonGitDir();
    expect(cli(['check', '--repo', WEBSITE], { cwd, env: e }).code).toBe(2);
  });
});
