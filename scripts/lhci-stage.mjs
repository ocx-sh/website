#!/usr/bin/env node
/**
 * Stages the built example under `<tmp>/docs/` for lhci's `staticDistDir`
 * (C-057). `.lighthouserc.cjs` serves that same `<tmp>` root and lists its
 * audited URLs as `/docs/...` paths, so the two files must agree on the
 * staged root — `STAGE_ROOT` below is that single source of truth; keep
 * `.lighthouserc.cjs`'s copy of the path in sync if it ever moves.
 *
 * Usage: `scripts/lighthouse.mjs` (`task lighthouse`) calls `stageExample()`;
 * `node scripts/lhci-stage.mjs` stages by hand.
 *
 * No top-level `await`: `.lighthouserc.cjs` (CommonJS, required by lhci's own
 * loader) `require()`s this module for `STAGE_ROOT` — Node's `require(esm)`
 * support (unflagged since 22.12/23.5, current here on Node 24) refuses any
 * ESM graph containing top-level await (`ERR_REQUIRE_ASYNC_MODULE`), so the
 * direct-invoke branch below chains `.then()/.catch()` instead of `await`ing.
 */
import { cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Staged root lhci serves as `staticDistDir`; `<tmp>/docs/` is the example. */
export const STAGE_ROOT = join(tmpdir(), 'ocx-website-lhci');

/** Copies `examples/starlight/dist` to `<STAGE_ROOT>/docs/`, replacing any
 * previous staged copy, and returns the staged root.
 * @returns {Promise<string>}
 */
export async function stageExample() {
  const dist = fileURLToPath(new URL('../examples/starlight/dist', import.meta.url));
  await rm(STAGE_ROOT, { recursive: true, force: true });
  await cp(dist, join(STAGE_ROOT, 'docs'), { recursive: true });
  return STAGE_ROOT;
}

async function main() {
  const root = await stageExample();
  process.stdout.write(`${root}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    process.stderr.write(`lhci-stage: FAILED — ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  });
}
