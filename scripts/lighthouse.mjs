#!/usr/bin/env node
/**
 * `task lighthouse` (C-057): every URL of `.lighthouserc.cjs`, judged by its `assertMatrix`
 * through lhci's own assertion engine, faster than `lhci autorun`:
 *
 * - Lanes: `LH_SHARDS` forked processes (default `DEFAULT_LANES`, fewer when `MemAvailable` is short),
 *   each driving ONE long-lived Chrome through the Lighthouse Node API. Audits run one at a time
 *   per browser (a fresh tab each); one static server (lhci's) serves every lane.
 * - Best of `RETRY_RUNS`: pass 1 audits every URL once across all lanes. A URL passes as soon as one
 *   run passes. The URLs that failed are re-audited afterwards on ONE lane (the others are shut down,
 *   so the retries run on a quiet machine; all lanes when more than `MANY_FAILED` failed) with the
 *   remaining runs, stopping at the first pass.
 *   A URL that never passes is reported with its run of fewest failed assertions.
 * - Cache: a URL whose key (`pageKey`: its HTML, every local file it pulls in, the tool versions,
 *   config, budgets, this script and the preset) matches a previous GREEN result is skipped.
 *   A key is written the moment its URL passes (pass 1 or a retry), so a killed run keeps its greens.
 *   `LH_NO_CACHE=1` audits everything. Store: `.tmp/lhci-cache/<preset>/`.
 * - Output: one `<page>-<run>.report.json` per run in `.lighthouseci/`; `LH_HTML=1` adds HTML.
 *   `target/reports/lighthouse/` gets `summary.md` (marker line, verdict, retried and failed runs
 *   with their metrics, the tightest pages; written only when something was audited, so an all-cached
 *   run leaves a previous PR comment alone; also appended to `$GITHUB_STEP_SUMMARY`), `metrics.json`
 *   and, with `LH_HTML=1`, the HTML reports of retried and failed URLs only.
 *
 * `--dev` (`task lighthouse:changed`) honours `LH_PRESET=desktop`; the gate is always mobile.
 * `--changed` and `--only <substr>` narrow the URL list for local runs (see `narrow`).
 * `--lane` is the internal child mode.
 */
import { fork } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import Module, { createRequire } from 'node:module';
import { freemem } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { changedFiles, loadContext, selectUrls } from './lhci-select.mjs';
import { STAGE_ROOT, stageExample } from './lhci-stage.mjs';

/**
 * @typedef {{ auditId: string, auditProperty?: string, name: string, operator: string,
 *   expected: number, actual: number, values: number[], passed: boolean }} AssertionResult
 * @typedef {{ matchingUrlPattern: string, assertions: Record<string, unknown> }} MatrixEntry
 * @typedef {{ collect: { url: string[], chromePath: string, settings: { chromeFlags: string } & Record<string, unknown> },
 *   assert: { assertMatrix: MatrixEntry[] } }} Rc
 * @typedef {{ score?: number | undefined, fcp?: number | undefined, lcp?: number | undefined, tbt?: number | undefined,
 *   cls?: number | undefined, si?: number | undefined }} Metrics
 * @typedef {{ failures: string[], metrics?: Metrics }} Run one audit: its failed assertions (none = passed)
 * @typedef {{ path: string, ms: number, runs: Run[] }} Result every audit of one URL, in order
 */

const require = createRequire(import.meta.url);
/** `require` for modules without types; the caller casts the result. */
const load = /** @type {(id: string) => unknown} */ (require);
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SELF = fileURLToPath(import.meta.url);
const GB = 1024 ** 3;
const PROFILES = join(ROOT, '.tmp/lhci-profiles');

/** Runs a failing URL gets in total; it passes as soon as one of them does. */
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

/** Marker line a CI step finds the sticky PR comment by; first line of `summary.md`. */
export const MARKER = '<!-- ocx-lighthouse -->';
/** UTF-8 bytes `summary.md` may take: GitHub caps a comment at 65,536 and the commenter adds a link. */
export const SUMMARY_LIMIT = 50_000;
/** First-pass failures above which the retries use every lane: a regression, not noise. */
export const MANY_FAILED = 10;
/** Pages the "tightest" table lists. */
export const TIGHTEST = 10;
const CELL_MAX = 300;

/**
 * Metrics of one report: performance score and the five numbers the score is made of.
 * @param {{ categories?: Record<string, { score?: number | null }>, audits?: Record<string, { numericValue?: number }> }} lhr
 * @returns {Metrics}
 */
export function runMetrics(lhr) {
  const num = (/** @type {string} */ id) => lhr.audits?.[id]?.numericValue;
  const round = (/** @type {number | undefined} */ v, /** @type {number} */ digits) =>
    v === undefined ? undefined : Number(v.toFixed(digits));
  return {
    score: round(lhr.categories?.performance?.score ?? undefined, 2),
    fcp: round(num('first-contentful-paint'), 0),
    lcp: round(num('largest-contentful-paint'), 0),
    tbt: round(num('total-blocking-time'), 0),
    cls: round(num('cumulative-layout-shift'), 3),
    si: round(num('speed-index'), 0),
  };
}

/**
 * The run that judges a URL: the first one that passed, else the one with the fewest failed
 * assertions (first on a tie; a run without metrics, i.e. a crash, ranks last).
 * @param {Run[]} runs
 * @returns {Run}
 */
export function bestRun(runs) {
  const rank = (/** @type {Run} */ r) => r.failures.length + (r.metrics ? 0 : 1e6);
  let best = runs[0] ?? { failures: ['no run'] };
  for (const r of runs) if (rank(r) < rank(best)) best = r;
  return best;
}

/** @param {Result} r */
const failedOf = (r) => bestRun(r.runs).failures.length > 0;

const seconds = (/** @type {number | undefined} */ ms) => (ms === undefined ? '-' : `${(ms / 1000).toFixed(2)} s`);
const cells = (/** @type {Metrics | undefined} */ m) => [
  m?.score?.toFixed(2) ?? '-',
  seconds(m?.fcp),
  seconds(m?.lcp),
  m?.tbt === undefined ? '-' : `${m.tbt} ms`,
  m?.cls?.toFixed(3) ?? '-',
  seconds(m?.si),
];
/**
 * Free text as one markdown code span in a table cell, capped. The comment workflow posts only cells of
 * this shape or fixed plain text, so nothing here can link, mention, embed or break the row: no
 * backtick, backslash or control character survives, and a pipe is escaped.
 */
const code = (/** @type {string} */ s) => {
  const flat = s.replace(/[`\\\s\p{C}]+/gu, ' ').trim();
  const cut = flat.length > CELL_MAX ? `${flat.slice(0, CELL_MAX)}…` : flat;
  return `\`${cut.replaceAll('|', '\\|')}\``;
};
const row = (/** @type {string[]} */ c) => `| ${c.join(' | ')} |`;
const rule = (/** @type {number} */ n) => row(Array.from({ length: n }, () => '---'));
const HEAD = ['Perf', 'FCP', 'LCP', 'TBT', 'CLS', 'SI'];

/**
 * `summary.md`: marker, verdict, every run of the retried and failed URLs, and the pages closest to
 * failing. Kept under `limit` UTF-8 bytes by dropping the tightest table first, then trailing run rows,
 * so a cut never lands inside a row or an open `<details>`.
 * Every free-text value is a code span (`code`); `.github/workflows/lighthouse-comment.yml` rejects any
 * other line shape, so a new line or cell shape here needs its pattern there.
 * @param {Result[]} results the audited URLs
 * @param {{ cached?: number, limit?: number }} [opts] `cached`: URLs skipped as cached green
 */
export function summaryMarkdown(results, { cached = 0, limit = SUMMARY_LIMIT } = {}) {
  const retried = results.filter((r) => r.runs.length > 1);
  const failed = results.filter(failedOf);
  const total = results.length + cached;
  const verdict =
    `**${total} URL${total === 1 ? '' : 's'}, ${retried.length} retried, ${failed.length} failed**` +
    (cached ? ` (${cached} cached green, not audited)` : '');

  // A lane crash fails a URL with no retry; it still needs its row.
  const listed = results.filter((r) => r.runs.length > 1 || failedOf(r));
  const rows = listed.flatMap((r) => {
    const best = bestRun(r.runs);
    return r.runs.map((run, i) =>
      row([
        i ? '' : code(r.path),
        String(i + 1),
        ...cells(run.metrics),
        (run.failures.length ? `fail ${code(run.failures.join('; '))}` : 'pass') +
          (run === best && failedOf(r) ? ' (reported)' : ''),
      ]),
    );
  });
  const rowsHead = [row(['URL', 'Run', ...HEAD, 'Result']), rule(HEAD.length + 3)];

  const tight = results
    .map((r) => ({ path: r.path, m: bestRun(r.runs).metrics }))
    .filter((t) => t.m)
    .sort((a, b) => (a.m?.score ?? 1) - (b.m?.score ?? 1) || (b.m?.lcp ?? 0) - (a.m?.lcp ?? 0))
    .slice(0, TIGHTEST)
    .map((t) => row([code(t.path), ...cells(t.m)]));

  /** @param {number} nRows @param {boolean} withTight */
  const build = (nRows, withTight) =>
    [
      MARKER,
      '## Lighthouse',
      '',
      verdict,
      ...(rows.length
        ? [
            '',
            '### Retried and failed',
            '',
            ...rowsHead,
            ...rows.slice(0, nRows),
            ...(nRows < rows.length ? ['', `${rows.length - nRows} more run rows omitted (size limit).`] : []),
          ]
        : []),
      ...(withTight && tight.length
        ? [
            '',
            `<details><summary>${tight.length} tightest pages (lowest performance score)</summary>`,
            '',
            row(['URL', ...HEAD]),
            rule(HEAD.length + 1),
            ...tight,
            '',
            '</details>',
          ]
        : []),
      '',
    ].join('\n');

  const size = (/** @type {string} */ s) => Buffer.byteLength(s);
  let n = rows.length;
  let md = build(n, true);
  if (size(md) > limit) md = build(n, false);
  while (size(md) > limit && n > 0) md = build(--n, false);
  return md;
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

/**
 * `--only <substr>`: the URLs containing it. `--changed`: the URLs the branch's changes touch (`lhci-select.mjs`).
 * Narrows `collect.url` in place and prints why each URL runs.
 * @param {Rc['collect']} collect
 */
function narrow(collect) {
  const argv = process.argv;
  const at = argv.indexOf('--only');
  const only = at >= 0 ? argv[at + 1] : argv.find((a) => a.startsWith('--only='))?.slice('--only='.length);
  if (only === undefined && !argv.includes('--changed')) return;
  const picked =
    only === undefined
      ? selectUrls(changedFiles(ROOT), collect.url, loadContext(ROOT))
      : { urls: collect.url.filter((u) => u.includes(only)), reasons: undefined, global: [] };
  for (const u of picked.urls) console.log(`  select ${u} (${picked.reasons?.get(u) ?? `--only ${only}`})`);
  if (picked.global.length) console.log(`  global change, full set runs in CI: ${picked.global.join(', ')}`);
  collect.url = picked.urls;
}

async function main() {
  const t0 = Date.now();
  const { collect } = rc();
  const preset = process.argv.includes('--dev') && process.env.LH_PRESET === 'desktop' ? 'desktop' : 'mobile';
  await stageExample();
  narrow(collect);

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
  const out = join(ROOT, 'target/reports/lighthouse');
  for (const dir of [reports, out]) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
  }
  mkdirSync(cacheDir, { recursive: true });

  const lanes = laneCount(Number(process.env.LH_SHARDS), availableBytes());
  const n = Math.min(lanes, todo.length);
  console.log(
    `lighthouse (${preset}): ${collect.url.length - todo.length} cached green, ${todo.length} to audit on ${n} lane(s)`,
  );
  /** @type {Result[]} */
  let results = [];
  const keep = (/** @type {string} */ path) => writeFileSync(join(cacheDir, `${slug(path)}.key`), keys.get(path) ?? '');
  if (todo.length) results = await audit(todo, n, preset, reports, out, keep);

  const cachedGreen = collect.url.length - todo.length;
  const md = summaryMarkdown(results, { cached: cachedGreen });
  if (results.length) writeFileSync(join(out, 'summary.md'), md);
  writeFileSync(join(out, 'metrics.json'), `${JSON.stringify({ preset, cached: cachedGreen, urls: results })}\n`);
  if (results.length && process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`);

  const failed = results.filter(failedOf);
  const runs = results.reduce((s, r) => s + r.runs.length, 0);
  console.log(`\nlighthouse: ${runs} run(s) over ${todo.length} URL(s) in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  if (!failed.length) return;
  console.error(
    `\n${failed.length} URL(s) failed (best of ${RETRY_RUNS} runs; the run with the fewest failures shown):`,
  );
  for (const r of failed)
    console.error(
      `  ${r.path}\n${bestRun(r.runs)
        .failures.map((f) => `    ${f}`)
        .join('\n')}`,
    );
  process.exitCode = 1;
}

/**
 * Pass 1: one run per URL on `n` lanes. Pass 2: the URLs that failed, on a single lane (all `n` when
 * more than `MANY_FAILED` failed) with the remaining runs; the other lanes are shut down first.
 * @param {string[]} todo
 * @param {number} n
 * @param {string} preset
 * @param {string} reports `.lighthouseci/`
 * @param {string} out `target/reports/lighthouse/`
 * @param {(path: string) => void} keep called the moment a URL passes, in either pass
 * @returns {Promise<Result[]>}
 */
async function audit(todo, n, preset, reports, out, keep) {
  const FallbackServer =
    /** @type {new (dir: string, spa: boolean) => { port: number, listen(): Promise<void>, close(): Promise<void> }} */ (
      load('@lhci/cli/src/collect/fallback-server.js')
    );
  const server = new FallbackServer(STAGE_ROOT, false);
  await server.listen();
  rmSync(PROFILES, { recursive: true, force: true }); // left by a killed run
  const children = Array.from({ length: n }, (_, i) =>
    fork(SELF, ['--lane'], {
      env: { ...process.env, LH_PRESET: preset, LH_REPORTS: reports, LH_OUT: out, LH_LANE: String(i) },
    }),
  );

  /**
   * Up to `runs` audits of `path` on one lane, ending at the first pass; report files number from `from`.
   * @param {import('node:child_process').ChildProcess} child
   * @param {string} path
   * @param {number} runs
   * @param {number} from
   * @returns {Promise<Result>}
   */
  const runOn = (child, path, runs, from) =>
    new Promise((resolve) => {
      /** @type {(failure: string) => void} */
      const fail = (failure) => resolve({ path, ms: 0, runs: [{ failures: [failure] }] });
      if (!child.connected) return fail('lane is gone');
      const onExit = (/** @type {number | null} */ code) => fail(`lane exited (${code}) mid-audit`);
      child.once('exit', onExit);
      child.once('message', (m) => {
        child.off('exit', onExit);
        resolve(/** @type {Result} */ (m));
      });
      child.send({ url: `http://localhost:${server.port}${path}`, path, runs, from });
    });
  const secs = (/** @type {Result} */ r) => `${(r.ms / 1000).toFixed(1)} s`;

  try {
    const first = await pool(todo, n, async (path, i) => {
      const r = await runOn(/** @type {import('node:child_process').ChildProcess} */ (children[i]), path, 1, 1);
      const why = failedOf(r) ? `; run 1 failed: ${bestRun(r.runs).failures.join('; ')}` : '';
      console.log(`${failedOf(r) ? 'retry' : 'pass'} ${path} (${secs(r)}${why})`);
      if (!failedOf(r)) keep(path);
      return r;
    });

    const failedFirst = first.filter(failedOf);
    // ponytail: serial retry pass; per-URL CPU pinning if contention still shows. Above MANY_FAILED it is a
    // regression, not noise, so every lane retries or the job crawls.
    const width = RETRY_RUNS < 2 ? 0 : failedFirst.length > MANY_FAILED ? n : 1;
    const live = children.filter((c) => c.connected);
    const use = live.slice(0, width);
    for (const c of live.slice(width)) c.disconnect();
    const pairs = await pool(use.length ? failedFirst : [], use.length, async (r, i) => {
      const lane = /** @type {import('node:child_process').ChildProcess} */ (use[i]);
      const more = await runOn(lane, r.path, RETRY_RUNS - 1, r.runs.length + 1);
      const all = { path: r.path, ms: r.ms + more.ms, runs: [...r.runs, ...more.runs] };
      console.log(`${failedOf(all) ? 'FAIL' : 'pass'} ${r.path} (${all.runs.length} runs, ${secs(all)})`);
      if (!failedOf(all)) keep(r.path);
      return /** @type {[string, Result]} */ ([r.path, all]);
    });
    const retried = new Map(pairs);
    return first.map((r) => retried.get(r.path) ?? r);
  } finally {
    for (const c of children) if (c.connected) c.disconnect();
    await server.close();
  }
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
  const out = process.env.LH_OUT ?? reports;
  const lhciUtils = require.resolve('@lhci/utils/src/assertions.js', {
    paths: [require.resolve('@lhci/cli/package.json')],
  });
  const { getAllAssertionResults } =
    /** @type {{ getAllAssertionResults: (o: object, lhrs: object[]) => AssertionResult[] }} */ (load(lhciUtils));
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
  const judge = (/** @type {object} */ lhr) => getAllAssertionResults({ assertMatrix: assert.assertMatrix }, [lhr]);

  const describe = (/** @type {AssertionResult[]} */ failed) =>
    failed.map(
      (a) =>
        `${a.auditProperty ? `${a.auditId}:${a.auditProperty}` : a.auditId} ${a.name} ${a.actual} (want ${a.operator} ${a.expected})`,
    );

  process.on('message', (m) => {
    const { url, path, runs, from } = /** @type {{ url: string, path: string, runs: number, from: number }} */ (m);
    const t0 = Date.now();
    /** @type {Run[]} */
    const done = [];
    const audit = async () => {
      for (let i = 0; i < runs; i++) {
        const r = await once(url);
        const failures = describe(judge(r.lhr));
        done.push({ failures, metrics: runMetrics(/** @type {Parameters<typeof runMetrics>[0]} */ (r.lhr)) });
        const name = `${slug(path)}-${from + i}.report`;
        writeFileSync(join(reports, `${name}.json`), JSON.stringify(r.lhr));
        if (html) {
          writeFileSync(join(reports, `${name}.html`), String(r.report));
          // Retried or failed URLs only: a first-run pass is not worth an artifact.
          if (failures.length || from + i > 1) writeFileSync(join(out, `${name}.html`), String(r.report));
        }
        if (!failures.length) return;
      }
    };
    audit().then(
      () => process.send?.({ path, ms: Date.now() - t0, runs: done }),
      (/** @type {unknown} */ err) =>
        process.send?.({
          path,
          ms: Date.now() - t0,
          runs: [...done, { failures: [`lighthouse error: ${String(err)}`] }],
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
