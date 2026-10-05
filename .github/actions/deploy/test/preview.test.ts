// Preview mode of the deploy action against the fake Bunny: it reaches only its own preview zone.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { previewUrl, previewZone, findSite } from '../../../../scripts/previews/sites.mjs';
import { deploy } from '../deploy.mjs';
import { run as runAction } from '../index.mjs';
import { fakeBunny } from './fake-bunny.ts';

const registry = vi.hoisted(() => ({ zone: undefined as string | undefined }));
vi.mock('../../../../packages/theme/src/registry.mjs', async (original) => {
  const real = await original<typeof import('../../../../packages/theme/src/registry.mjs')>();
  return { ...real, zoneName: (repo: string) => registry.zone ?? real.zoneName(repo) };
});

type Nav = Parameters<typeof deploy>[0]['nav'];
const nav = JSON.parse(
  readFileSync(join(import.meta.dirname, '../../../../packages/theme/src/nav.json'), 'utf8'),
) as Nav;

const KEY = 'k-secret-0123456789';
const HOST = 'storage.test';
const SITE = 'rules_ocx';
const ZONE = previewZone(SITE);

const dirs: string[] = [];
afterEach(() => {
  registry.zone = undefined;
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function makeDist(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'preview-dist-'));
  dirs.push(root);
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(root, dirname(rel)), { recursive: true });
    writeFileSync(join(root, rel), body);
  }
  return root;
}

// Not a claim layout: a dead link, a page outside any claim path, a root-level 404.
const PREVIEW_DIST = {
  'index.html': '<a href="/nowhere/">x</a>',
  'guide/page.html': 'p',
  '404.html': 'missing',
  '_astro/app.js': 'js',
};

interface Setup {
  preview?: string;
  path?: string;
  repo?: string;
  dist?: Record<string, string>;
  files?: Record<string, string>;
  forcePrune?: boolean;
}

function setup(o: Setup = {}) {
  const fake = fakeBunny({ zone: ZONE, key: KEY, files: o.files ?? {} });
  const run = () =>
    deploy({
      inputs: {
        dist: makeDist(o.dist ?? PREVIEW_DIST),
        ...(o.path === undefined ? {} : { path: o.path }),
        preview: o.preview ?? SITE,
        dryRun: false,
        forcePrune: o.forcePrune ?? false,
      },
      repo: o.repo ?? 'ocx-sh/website',
      nav,
      storage: { host: HOST, accessKey: KEY, fetch: fake.fetch },
      sleep: async () => {},
    });
  return { fake, run };
}

async function failure(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  throw new Error('expected the deploy to fail');
}

describe('preview target', () => {
  it('deploys at the zone root with no claim, no layout and no link check, and reports the preview url', async () => {
    const { fake, run } = setup({ repo: 'ocx-sh/nobody' });
    expect(await run()).toMatchObject({ url: previewUrl(findSite(SITE)), uploaded: 4, deleted: 0 });
    expect([...fake.files.keys()].sort()).toEqual(
      ['_astro/app.js', 'bunnycdn_errors/404.html', 'guide/page.html', 'index.html'].sort(),
    );
    expect(fake.violations).toEqual([]);
  });

  it('reaches only its own preview zone, whether named by name or by slug', async () => {
    for (const preview of ['rules_ocx', 'rules-ocx']) {
      const { fake, run } = setup({ preview });
      await run();
      expect(fake.requests.length).toBeGreaterThan(0);
      for (const r of fake.requests) expect(r.url.startsWith(`https://${HOST}/sh-ocx-preview-rules-ocx/`)).toBe(true);
    }
  });

  it('writes outputs.url as the preview url', async () => {
    const out = mkdtempSync(join(tmpdir(), 'preview-out-'));
    dirs.push(out);
    const fake = fakeBunny({ zone: ZONE, key: KEY, files: {} });
    const code = await runAction(
      {
        'INPUT_STORAGE-KEY': KEY,
        INPUT_DIST: makeDist(PREVIEW_DIST),
        'INPUT_STORAGE-HOST': HOST,
        INPUT_PREVIEW: SITE,
        GITHUB_REPOSITORY: 'ocx-sh/website',
        GITHUB_OUTPUT: join(out, 'output'),
      },
      { fetch: fake.fetch, log: () => {}, sleep: async () => {} },
    );
    expect(code).toBe(0);
    expect(readFileSync(join(out, 'output'), 'utf8')).toContain(`url=https://sh-ocx-preview-rules-ocx.b-cdn.net/\n`);
  });
});

describe('preview refusals send zero requests', () => {
  it('an unknown site', async () => {
    const { fake, run } = setup({ preview: 'nope' });
    expect(await failure(run)).toMatch(/unknown preview site/);
    expect(fake.requests).toEqual([]);
  });

  it('preview together with path', async () => {
    const { fake, run } = setup({ path: '/integrations/bazel/' });
    expect(await failure(run)).toMatch(/preview.*path|path.*preview/);
    expect(fake.requests).toEqual([]);
  });

  it('a preview dist without index.html', async () => {
    const { fake, run } = setup({ dist: { 'other.html': 'x' } });
    expect(await failure(run)).toMatch(/index\.html/);
    expect(fake.requests).toEqual([]);
  });

  it('a Pagefind index of the wrong version', async () => {
    const dist = { ...PREVIEW_DIST, 'pagefind/pagefind-entry.json': '{"version":"0.0.1"}' };
    const { fake, run } = setup({ dist });
    expect(await failure(run)).toMatch(/pagefind/i);
    expect(fake.requests).toEqual([]);
  });

  it('a resolved sh-ocx-preview- zone without preview mode', async () => {
    registry.zone = 'sh-ocx-preview-rules-ocx';
    const fake = fakeBunny({ zone: registry.zone, key: KEY, files: {} });
    const err = await failure(() =>
      deploy({
        inputs: { dist: makeDist({ 'index.html': 'x' }), dryRun: false, forcePrune: false },
        repo: 'ocx-sh/catalog',
        nav,
        storage: { host: HOST, accessKey: KEY, fetch: fake.fetch },
        sleep: async () => {},
      }),
    );
    expect(err).toMatch(/sh-ocx-preview-/);
    expect(fake.requests).toEqual([]);
  });
});

describe('preview prune', () => {
  it('prunes stale HTML across the whole zone, even under a claim path of the registry, never assets or the error page', async () => {
    const { fake, run } = setup({
      dist: { 'index.html': 'new' },
      files: {
        'index.html': 'old',
        'docs/stale.html': 'x',
        'integrations/bazel/stale.html': 'x',
        'old.js': 'orphan asset',
        'bunnycdn_errors/404.html': 'err',
      },
    });
    expect(await run()).toMatchObject({ deleted: 2 });
    expect([...fake.files.keys()].sort()).toEqual(['bunnycdn_errors/404.html', 'index.html', 'old.js']);
  });

  it('applies the prune cap, and force-prune lifts it', async () => {
    const stale = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`gone${i}.html`, 'x']));
    const capped = setup({ dist: { 'index.html': 'new' }, files: { 'index.html': 'old', ...stale } });
    expect(await failure(capped.run)).toMatch(/9 of 10/);
    expect(capped.fake.requests.some((r) => r.method === 'DELETE')).toBe(false);

    const forced = setup({ dist: { 'index.html': 'new' }, files: { 'index.html': 'old', ...stale }, forcePrune: true });
    expect(await forced.run()).toMatchObject({ deleted: 9 });
  });
});
