#!/usr/bin/env node
/**
 * Stages the built root site at `STAGE_ROOT` and the built example under `<tmp>/docs/` for lhci's
 * `staticDistDir`, mirroring how ocx.sh serves them. `.lighthouserc.cjs` serves that same root and
 * lists its audited URLs as site paths and `/docs/...` paths, so the two files must agree on the
 * staged root: `STAGE_ROOT` below is that single source of truth.
 *
 * Usage: `scripts/lighthouse.mjs` (`task lighthouse`) calls `stageExample()`;
 * `node scripts/lhci-stage.mjs` stages by hand; `node scripts/lhci-stage.mjs --serve <port>` stages
 * and keeps serving it (the Playwright `site` project's web server).
 *
 * No top-level `await`: `.lighthouserc.cjs` (CommonJS, required by lhci's own
 * loader) `require()`s this module for `STAGE_ROOT` — Node's `require(esm)`
 * support (unflagged since 22.12/23.5, current here on Node 24) refuses any
 * ESM graph containing top-level await (`ERR_REQUIRE_ASYNC_MODULE`), so the
 * direct-invoke branch below chains `.then()/.catch()` instead of `await`ing.
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, cp, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import nav from '@ocx-sh/theme/nav.json' with { type: 'json' };
import { mergeTargets } from '@ocx-sh/theme/nav';
import { createIndex } from 'pagefind';

const dist = (/** @type {string} */ rel) => fileURLToPath(new URL(rel, import.meta.url));

/**
 * Staged root lhci serves as `staticDistDir`: `site/dist` at `/`, the example at `<tmp>/docs/`.
 * Keyed by the repo path: every run wipes its stage, so parallel worktrees need separate ones.
 */
export const STAGE_ROOT = join(
  tmpdir(),
  `ocx-website-lhci-${createHash('sha256').update(dist('../')).digest('hex').slice(0, 12)}`,
);

/** Stages the root site at `root` and the built example at `<root>/docs/`, replacing any previous
 * stage, and returns the root. A missing dist throws (`task` checks first).
 * @param {{ root?: string, site?: string, example?: string }} [from] defaults: `STAGE_ROOT` and the repo's dists
 * @returns {Promise<string>}
 */
export async function stageExample({
  root = STAGE_ROOT,
  site = dist('../site/dist'),
  example = dist('../examples/starlight/dist'),
} = {}) {
  await rm(root, { recursive: true, force: true });
  await cp(site, root, { recursive: true });
  await cp(example, join(root, 'docs'), { recursive: true });
  await stubSectionBundles(root);
  return root;
}

/**
 * The stage holds the root site and `/docs/` only, but the root search merges every non-legacy
 * section's Pagefind bundle and dies on the first one that 404s. Each merge target the stage lacks
 * gets a one-page stub bundle, as the section repo would serve it.
 * @param {string} root
 */
async function stubSectionBundles(root) {
  for (const { path, label } of mergeTargets(nav, '/')) {
    const out = join(root, path, 'pagefind');
    if (
      await access(join(out, 'pagefind-entry.json')).then(
        () => true,
        () => false,
      )
    )
      continue;
    const { index } = await createIndex({});
    await index?.addHTMLFile({
      url: path,
      content: `<html lang="en"><body><main data-pagefind-body><h1>${label}</h1><p>Stub section page.</p></main></body></html>`,
    });
    await index?.writeFiles({ outputPath: out });
    await index?.deleteIndex();
  }
}

const TYPES = /** @type {Record<string, string>} */ ({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
  '.woff2': 'font/woff2',
});

/**
 * Serves `root` on `port` the way the CDN does: a directory with a trailing slash answers with its
 * `index.html`, one without redirects to the slash. Playwright's `webServer` for the combined stage.
 * ponytail: no gzip, no range requests; add when a spec measures transfer size here.
 * @param {string} root
 * @param {number} port
 * @returns {Promise<import('node:http').Server>}
 */
export function serveStage(root, port) {
  const server = createServer((req, res) => {
    const { pathname } = new URL(req.url ?? '/', 'http://x');
    let rel;
    try {
      rel = normalize(decodeURIComponent(pathname)); // `..` cannot climb above the root once normalized
    } catch {
      res.writeHead(400).end('bad request'); // malformed `%` escape
      return;
    }
    const file = join(root, rel.endsWith('/') ? `${rel}index.html` : rel);
    stat(file).then(
      (st) => {
        if (st.isDirectory()) {
          res.writeHead(301, { location: `${pathname}/` }).end();
        } else {
          res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
          createReadStream(file).pipe(res);
        }
      },
      () => res.writeHead(404).end('not found'),
    );
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

async function main() {
  const root = await stageExample();
  const port = process.argv[2] === '--serve' ? Number(process.argv[3]) : 0;
  if (port) await serveStage(root, port);
  process.stdout.write(`${root}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    process.stderr.write(`lhci-stage: FAILED — ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  });
}
