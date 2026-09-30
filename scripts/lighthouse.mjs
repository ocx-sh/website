#!/usr/bin/env node
/**
 * `task lighthouse` (C-057): every URL of `.lighthouserc.cjs`, judged by its `assertMatrix`
 * through lhci's own assertion engine, faster than `lhci autorun`:
 *
 * - Lanes: `LH_SHARDS` forked processes (default `DEFAULT_LANES`, fewer when `MemAvailable` is short),
 *   each driving ONE long-lived Chrome through the Lighthouse Node API. Audits run one at a time
 *   per browser (a fresh tab each); one static server (lhci's) serves every lane.
 * - One run per URL; a URL that fails gets `RETRY_RUNS - 1` more runs and is judged on the median
 *   run (lhci's representative run: closest to the median FCP and TTI).
 * - Cache: a URL whose key (`pageKey`: its HTML, every local file it pulls in, the tool versions,
 *   config, budgets, this script and the preset) matches a previous GREEN result is skipped.
 *   `LH_NO_CACHE=1` audits everything. Store: `.tmp/lhci-cache/<preset>/`.
 * - Output: one `<page>-<run>.report.json` per run in `.lighthouseci/`; `LH_HTML=1` adds HTML.
 *
 * `--dev` (`task lighthouse:changed`) honours `LH_PRESET=desktop`; the gate is always mobile.
 * `--lane` is the internal child mode.
 */
import { fork } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import Module, { createRequire } from 'node:module';
import { freemem } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STAGE_ROOT, stageExample } from './lhci-stage.mjs';

/**
 * @typedef {{ auditId: string, auditProperty?: string, name: string, operator: string,
 *   expected: number, actual: number, values: number[], passed: boolean }} AssertionResult
 * @typedef {{ matchingUrlPattern: string, assertions: Record<string, unknown> }} MatrixEntry
 * @typedef {{ collect: { url: string[], chromePath: string, settings: { chromeFlags: string } & Record<string, unknown> },
 *   assert: { assertMatrix: MatrixEntry[] } }} Rc
 * @typedef {{ path: string, runs: number, ms: number, first?: string, failures: string[] }} Result
 */

const require = createRequire(import.meta.url);
/** `require` for modules without types; the caller casts the result. */
const load = /** @type {(id: string) => unknown} */ (require);
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SELF = fileURLToPath(import.meta.url);
const GB = 1024 ** 3;
const PROFILES = join(ROOT, '.tmp/lhci-profiles');

/** Runs a failing URL gets in total before its median run is judged. */
export const RETRY_RUNS = 3;
/** Lanes when `LH_SHARDS` is unset. */
export const DEFAULT_LANES = 3;
/** Memory one lane (Chrome + Lighthouse process) may take (measured 1.6-1.7 GB), and the headroom left untouched. */
export const LANE_BYTES = 2 * GB;
export const HEADROOM_BYTES = 3 * GB;

const rc = () => /** @type {{ ci: Rc }} */ (load('../.lighthouserc.cjs')).ci;

/**
 * Lanes to start: the request, clamped so each gets `LANE_BYTES` above `HEADROOM_BYTES`; at least 1.
 * @param {number} requested
 * @param {number} availableBytes
 */
export function laneCount(requested, availableBytes) {
  const fit = Math.floor((availableBytes - HEADROOM_BYTES) / LANE_BYTES);
  return Math.max(1, Math.min(Math.floor(requested) || DEFAULT_LANES, fit));
}

/** `MemAvailable` (free + reclaimable cache); `os.freemem()` off Linux. */
function availableBytes() {
  try {
    const kb = /MemAvailable:\s+(\d+)/.exec(readFileSync('/proc/meminfo', 'utf8'))?.[1];
    if (kb) return Number(kb) * 1024;
  } catch {
    // not Linux
  }
  return freemem();
}

/**
 * Runs `fn` over `items` on `n` lanes: each lane takes the next item when its last one is done.
 * @template T, R
 * @param {T[]} items
 * @param {number} n
 * @param {(item: T, lane: number) => Promise<R>} fn
 * @returns {Promise<R[]>} results in item order
 */
export async function pool(items, n, fn) {
  /** @type {R[]} */
  const out = [];
  let next = 0;
  const lane = async (/** @type {number} */ i) => {
    while (next < items.length) {
      const at = next++;
      out[at] = await fn(/** @type {T} */ (items[at]), i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, (_, i) => lane(i)));
  return out;
}

/** Served path → file under `root` (`/docs/x/` → `docs/x/index.html`). */
const fileOf = (/** @type {string} */ root, /** @type {string} */ path) =>
  join(root, path.endsWith('/') ? `${path}index.html` : path);

// ponytail: a textual scan, not a parser. Catches quoted, url() and import paths with an
// extension; misses paths built at runtime (Pagefind's `${base}pagefind.js`, loaded only on
// interaction, which Lighthouse never does). Add a manifest walk if a gated page ever needs one.
const REF = /["'`(=\s,]((?:\.{1,2})?\/[\w\-./@~%+]+\.\w+)/g;
const FOLLOW = /\.(?:css|m?js)$/;

/**
 * Cache key of one page: `salt`, its HTML, and every local file it references, transitively
 * through CSS and JS (other pages excluded).
 * @param {string} root directory served at `/`
 * @param {string} path page path, e.g. `/docs/components/tabs/`
 * @param {string} salt see `salt()`
 */
export function pageKey(root, path, salt) {
  const hash = createHash('sha256').update(salt);
  const queue = [path];
  const seen = new Set(queue);
  for (const p of queue) {
    const bytes = readFileSync(fileOf(root, p));
    hash.update(`\0${p}\0`).update(bytes);
    if (p !== path && !FOLLOW.test(p)) continue;
    for (const [, ref = ''] of bytes.toString('utf8').matchAll(REF)) {
      const url = new URL(ref, `http://x${p}`);
      const dep = decodeURIComponent(url.pathname);
      if (url.origin !== 'http://x' || dep.endsWith('.html') || seen.has(dep)) continue;
      seen.add(dep);
      if (statSync(fileOf(root, dep), { throwIfNoEntry: false })?.isFile()) queue.push(dep);
    }
  }
  return hash.digest('hex');
}

/**
 * Everything besides the page that decides a result: tool versions, config, budgets, this runner,
 * the preset and the browser build.
 * @param {string} preset
 * @param {string} chromePath
 */
function salt(preset, chromePath) {
  const hash = createHash('sha256');
  for (const f of [
    'node_modules/lighthouse/package.json',
    'node_modules/@lhci/cli/package.json',
    '.lighthouserc.cjs',
    'tests/budgets.mjs',
    'scripts/lighthouse.mjs',
  ])
    hash.update(readFileSync(join(ROOT, f)));
  return hash.update(`\0${preset}\0${chromePath}`).digest('hex');
}

const slug = (/** @type {string} */ path) => path.replace(/^\/|\/$/g, '').replace(/[^\w.-]+/g, '_') || 'index';

async function main() {
  const t0 = Date.now();
  const { collect } = rc();
  const preset = process.argv.includes('--dev') && process.env.LH_PRESET === 'desktop' ? 'desktop' : 'mobile';
  await stageExample();

  const key = salt(preset, collect.chromePath);
  const cacheDir = join(ROOT, '.tmp/lhci-cache', preset);
  const cached = (/** @type {string} */ path) => {
    try {
      return readFileSync(join(cacheDir, `${slug(path)}.key`), 'utf8');
    } catch {
      return undefined;
    }
  };
  const keys = new Map(collect.url.map((u) => [u, pageKey(STAGE_ROOT, u, key)]));
  const todo = process.env.LH_NO_CACHE === '1' ? collect.url : collect.url.filter((u) => cached(u) !== keys.get(u));
  const reports = join(ROOT, '.lighthouseci');
  rmSync(reports, { recursive: true, force: true });
  mkdirSync(reports, { recursive: true });
  mkdirSync(cacheDir, { recursive: true });

  const lanes = laneCount(Number(process.env.LH_SHARDS), availableBytes());
  const n = Math.min(lanes, todo.length);
  console.log(
    `lighthouse (${preset}): ${collect.url.length - todo.length} cached green, ${todo.length} to audit on ${n} lane(s)`,
  );
  if (!todo.length) return;

  const FallbackServer =
    /** @type {new (dir: string, spa: boolean) => { port: number, listen(): Promise<void>, close(): Promise<void> }} */ (
      load('@lhci/cli/src/collect/fallback-server.js')
    );
  const server = new FallbackServer(STAGE_ROOT, false);
  await server.listen();
  rmSync(PROFILES, { recursive: true, force: true }); // left by a killed run
  const children = Array.from({ length: n }, (_, i) =>
    fork(SELF, ['--lane'], { env: { ...process.env, LH_PRESET: preset, LH_REPORTS: reports, LH_LANE: String(i) } }),
  );
  /** @type {Result[]} */
  let results;
  try {
    results = await pool(todo, n, (path, i) => {
      const child = /** @type {import('node:child_process').ChildProcess} */ (children[i]);
      return new Promise((resolve) => {
        /** @type {(failure: string) => void} */
        const fail = (failure) => resolve({ path, runs: 0, ms: 0, failures: [failure] });
        if (!child.connected) return fail('lane is gone');
        const onExit = (/** @type {number | null} */ code) => fail(`lane exited (${code}) mid-audit`);
        child.once('exit', onExit);
        child.once('message', (m) => {
          child.off('exit', onExit);
          const r = /** @type {Result} */ (m);
          if (!r.failures.length) writeFileSync(join(cacheDir, `${slug(path)}.key`), keys.get(path) ?? '');
          const retried = r.first ? `; run 1 failed: ${r.first}` : '';
          console.log(
            `${r.failures.length ? 'FAIL' : 'pass'} ${path} (${r.runs} run(s), ${(r.ms / 1000).toFixed(1)} s${retried})`,
          );
          resolve(r);
        });
        child.send({ url: `http://localhost:${server.port}${path}`, path });
      });
    });
  } finally {
    for (const c of children) if (c.connected) c.disconnect();
    await server.close();
  }

  const failed = results.filter((r) => r.failures.length);
  const runs = results.reduce((s, r) => s + r.runs, 0);
  console.log(`\nlighthouse: ${runs} run(s) over ${todo.length} URL(s) in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  if (!failed.length) return;
  console.error(`\n${failed.length} URL(s) failed (judged on the median of ${RETRY_RUNS} runs):`);
  for (const r of failed) console.error(`  ${r.path}\n${r.failures.map((f) => `    ${f}`).join('\n')}`);
  process.exitCode = 1;
}

/** Child: one Chrome for the lane's lifetime; audits the URLs the parent sends, one at a time. */
async function lane() {
  // chrome-launcher's WSL branch hands this Linux Chrome a Windows profile path (a literal
  // `\\wsl.localhost\…\AppData\…` directory in the cwd) and drops `--disable-setuid-sandbox`.
  // Chrome here is Linux: pin its `is-wsl` to false before chrome-launcher loads it.
  const isWsl = createRequire(require.resolve('chrome-launcher')).resolve('is-wsl');
  require.cache[isWsl] = Object.assign(new Module(isWsl), { filename: isWsl, loaded: true, exports: false });
  const { default: lighthouse } = await import('lighthouse');
  const { launch } = await import('chrome-launcher');
  const { collect, assert } = rc();
  const { chromeFlags, ...settings } = collect.settings;
  const config =
    process.env.LH_PRESET === 'desktop'
      ? (await import('lighthouse/core/config/desktop-config.js')).default
      : undefined;
  const html = process.env.LH_HTML === '1';
  const reports = process.env.LH_REPORTS ?? '.lighthouseci';
  const lhciUtils = require.resolve('@lhci/utils/src/assertions.js', {
    paths: [require.resolve('@lhci/cli/package.json')],
  });
  const { getAllAssertionResults } =
    /** @type {{ getAllAssertionResults: (o: object, lhrs: object[]) => AssertionResult[] }} */ (load(lhciUtils));
  const { computeRepresentativeRuns } = /** @type {{ computeRepresentativeRuns: <T>(r: [T, T][][]) => T[] }} */ (
    load(lhciUtils.replace('assertions.js', 'representative-runs.js'))
  );
  // One profile per lane for the browser's lifetime, removed on every way out.
  const profile = join(PROFILES, process.env.LH_LANE ?? String(process.pid));
  const fresh = () => rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
  const start = () => {
    fresh();
    mkdirSync(profile, { recursive: true });
    return launch({
      chromePath: collect.chromePath,
      chromeFlags: chromeFlags.split(' '),
      userDataDir: profile,
      handleSIGINT: false,
    });
  };
  let chrome = await start();
  const stop = () => {
    chrome.kill();
    fresh();
  };
  // Parent gone: nothing else holds the lane open once Chrome is down.
  process.on('disconnect', stop);
  for (const signal of /** @type {const} */ (['SIGINT', 'SIGTERM'])) {
    process.once(signal, () => {
      stop();
      process.kill(process.pid, signal);
    });
  }

  /** One audit; a crashed browser is replaced, like lhci's three attempts per run. */
  const once = async (/** @type {string} */ url) => {
    for (let attempt = 1; ; attempt++) {
      try {
        const result = await lighthouse(
          url,
          { port: chrome.port, output: html ? 'html' : 'json', logLevel: 'error', ...settings },
          config,
        );
        if (!result) throw new Error('Lighthouse returned no result');
        return result;
      } catch (err) {
        if (attempt === 3) throw err;
        chrome.kill();
        chrome = await start();
      }
    }
  };
  /** @param {import('lighthouse').RunnerResult[]} runs */
  const judge = (runs) => {
    const [median] = computeRepresentativeRuns([runs.map((r) => /** @type {[object, object]} */ ([r.lhr, r.lhr]))]);
    return getAllAssertionResults({ assertMatrix: assert.assertMatrix }, [/** @type {object} */ (median)]);
  };

  const describe = (/** @type {AssertionResult[]} */ failed) =>
    failed.map(
      (a) =>
        `${a.auditProperty ? `${a.auditId}:${a.auditProperty}` : a.auditId} ${a.name} ${a.actual} (want ${a.operator} ${a.expected})`,
    );

  process.on('message', (m) => {
    const { url, path } = /** @type {{ url: string, path: string }} */ (m);
    const t0 = Date.now();
    /** @type {import('lighthouse').RunnerResult[]} */
    const runs = [];
    let first = '';
    const audit = async () => {
      runs.push(await once(url));
      let failed = judge(runs);
      if (failed.length) {
        first = describe(failed).join('; ');
        while (runs.length < RETRY_RUNS) runs.push(await once(url));
        failed = judge(runs);
      }
      runs.forEach((r, i) => {
        const base = join(reports, `${slug(path)}-${i + 1}.report`);
        writeFileSync(`${base}.json`, JSON.stringify(r.lhr));
        if (html) writeFileSync(`${base}.html`, String(r.report));
      });
      return describe(failed);
    };
    audit().then(
      (failures) => process.send?.({ path, runs: runs.length, ms: Date.now() - t0, first, failures }),
      (/** @type {unknown} */ err) =>
        process.send?.({
          path,
          runs: runs.length,
          ms: Date.now() - t0,
          first,
          failures: [`lighthouse error: ${String(err)}`],
        }),
    );
  });
}

if (process.argv[1] === SELF) {
  const isLane = process.argv.includes('--lane');
  (isLane ? lane() : main()).catch((/** @type {unknown} */ err) => {
    console.error(`lighthouse: FAILED — ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    process.exitCode = 1;
    // A lane's IPC channel keeps it alive; drop it so the lane ends and the parent sees it gone.
    if (isLane) process.disconnect?.();
  });
}
