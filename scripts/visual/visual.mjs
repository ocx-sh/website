#!/usr/bin/env node
/**
 * Visual loop: screenshots every mock/site pair in tests/visual/pairs.ts and writes .tmp/visual/report.html
 * (mock | site light desktop | diff, plus the other three site variants). A missing mock or an unreachable
 * site becomes a row, never a crash, but a "site unavailable" row fails the run (exit 1): a broken site must not
 * read as green. `--watch` regenerates on change and never exits.
 *
 * Usage: node scripts/visual/visual.mjs [--watch] [--site <baseUrl>]   (default site http://localhost:4321)
 * Contract C-058, scenario S-001 (design §7).
 */
import { createReadStream, existsSync, statSync, watch } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** @typedef {import('../../tests/visual/pairs.ts').Pair} Pair */
/** @typedef {import('../../tests/visual/pairs.ts').MockRef} MockRef */
/** @typedef {import('../../tests/visual/pairs.ts').OpenStep} OpenStep */
/** @typedef {'light-desktop' | 'light-mobile' | 'dark-desktop' | 'dark-mobile'} Variant */
/**
 * Per-shot options forwarded from a `Pair`: `selector` crops the shot to that element instead of
 * the full page; `open` runs before the shot to reach an overlay's open state.
 * @typedef {{ selector?: string, open?: OpenStep | readonly OpenStep[] }} SiteOpts
 */
/** @typedef {{ watch: boolean, site: string }} Args */
/** An element whose computed corner radius exceeds the 2px token ceiling. @typedef {{ what: string, radius: string }} Radius */
/**
 * One report row. `images` holds paths relative to `outDir` (so the report can link them); `mismatch` is the
 * pixelmatch ratio of differing pixels (0..1), set only for kind 'ok'. `error` explains the other kinds.
 * `url` is the shot page; `radius` lists elements rounder than 2px on light desktop (report only).
 * @typedef {{
 *   name: string,
 *   path: string,
 *   kind: 'ok' | 'mock missing' | 'site unavailable' | 'no tile',
 *   images: Partial<Record<'mock' | 'diff' | Variant, string>>,
 *   mismatch?: number,
 *   error?: string,
 *   url?: string,
 *   radius?: Radius[],
 * }} Result
 */
/**
 * Screenshot backend, injected so `run` is testable without a browser.
 * `mock` returns false when the file or `[id="<id>"]` is absent. `site` rejects when the page is unreachable;
 * it may resolve to the radius findings for the page (the real shooter does so for light-desktop).
 * @typedef {{
 *   mock(ref: MockRef, out: string): Promise<boolean>,
 *   site(url: string, variant: Variant, out: string, opts?: SiteOpts): Promise<Radius[] | void>,
 *   close(): Promise<void>,
 * }} Shooter
 */
/**
 * Pixel diff of two PNGs cropped to their common size, written to `out`; resolves to the mismatch ratio.
 * @typedef {(a: string, b: string, out: string) => Promise<number>} Differ
 */

/** @type {readonly Variant[]} */
export const VARIANTS = ['light-desktop', 'light-mobile', 'dark-desktop', 'dark-mobile'];

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/**
 * @param {readonly string[]} argv arguments after the script path
 * @returns {Args}
 */
export function parseArgs(argv) {
  const at = argv.indexOf('--site');
  return { watch: argv.includes('--watch'), site: (at >= 0 && argv[at + 1]) || 'http://localhost:4321' };
}

/** @param {unknown} s */
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

/**
 * @param {string} label
 * @param {string | undefined} src
 */
function figure(label, src) {
  const body = src
    ? `<a href="${esc(src)}" target="_blank"><img src="${esc(src)}" alt="${esc(label)}" loading="lazy"></a>`
    : `<div class="placeholder">no ${esc(label)}</div>`;
  return `<figure><figcaption>${esc(label)}</figcaption>${body}</figure>`;
}

/** @param {Result} r */
function row(r) {
  const pct = r.mismatch === undefined ? '' : `<small>mismatch ${(r.mismatch * 100).toFixed(1)}%</small>`;
  const radius =
    r.radius === undefined
      ? ''
      : r.radius.length === 0
        ? '<p class="radius radius--ok">radius &gt; 2px: ✓ none</p>'
        : `<details class="radius" open><summary>radius &gt; 2px: ${r.radius.length}</summary><ul>${r.radius
            .map((x) => `<li><code>${esc(x.what)}</code> ${esc(x.radius)}</li>`)
            .join('')}</ul></details>`;
  return `<section class="row">
<h2>${esc(r.name)} <a href="${esc(r.url ?? r.path)}">${esc(r.path)}</a>
<span class="kind kind--${r.kind.replace(' ', '-')}">${esc(r.kind)}</span>${pct}</h2>
${r.error ? `<p class="error">${esc(r.error)}</p>` : ''}${radius}
<div class="grid">${figure('mock', r.images.mock)}${figure('site light-desktop', r.images['light-desktop'])}${figure('diff', r.images.diff)}</div>
<div class="variants">${VARIANTS.slice(1)
    .map((v) => figure(`site ${v}`, r.images[v]))
    .join('')}</div>
</section>`;
}

/**
 * Replaces `<!--ROWS-->` in the template with one row per result (and `<!--STAMP-->` with `stamp`). Pure.
 * @param {string} template
 * @param {readonly Result[]} results
 * @param {string} [stamp]
 * @returns {string}
 */
export function renderReport(template, results, stamp = '') {
  return template.replace('<!--STAMP-->', () => esc(stamp)).replace('<!--ROWS-->', () => results.map(row).join('\n'));
}

/** @param {string} name */
const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/**
 * Shoots every pair, diffs mock vs site light-desktop, writes `<outDir>/report.html`. Never throws for a
 * missing mock or unreachable site; those become rows.
 * @param {{ pairs: readonly Pair[], shoot: Shooter, diff: Differ, outDir: string, template: string, site: string }} opts
 * @returns {Promise<Result[]>}
 */
export async function run({ pairs, shoot, diff, outDir, template, site }) {
  /** @type {Result[]} */
  const results = [];
  for (const p of pairs) {
    const rel = (/** @type {string} */ key) => `pairs/${slug(p.name)}/${key}.png`;
    await mkdir(join(outDir, 'pairs', slug(p.name)), { recursive: true });
    const url = site.replace(/\/$/, '') + p.path;
    /** @type {Result} */
    const r = { name: p.name, path: p.path, kind: 'ok', images: {}, url };
    const firstLine = (/** @type {unknown} */ err) => String(err instanceof Error ? err.message : err).split('\n')[0];
    if (!p.mock) {
      r.kind = 'no tile'; // no design-sheet tile covers this pair yet (retro P-7); never invent one
    } else {
      const mock = p.mock;
      const mockRel = rel(`mock-${slug(mock.file)}-${slug(mock.id)}`); // keyed by source: the shot is cached
      try {
        if (await shoot.mock(mock, join(outDir, mockRel))) r.images.mock = mockRel;
        else Object.assign(r, { kind: 'mock missing', error: `no [id="${mock.id}"] in ${mock.file}` });
      } catch (err) {
        Object.assign(r, { kind: 'mock missing', error: firstLine(err) });
      }
    }
    /** @type {SiteOpts} */
    const siteOpts = {
      ...(p.selector !== undefined && { selector: p.selector }),
      ...(p.open !== undefined && { open: p.open }),
    };
    try {
      for (const v of VARIANTS) {
        const found = await shoot.site(url, v, join(outDir, rel(v)), siteOpts);
        r.images[v] = rel(v);
        if (found) r.radius = found;
      }
    } catch (err) {
      Object.assign(r, { kind: 'site unavailable', error: firstLine(err) });
    }
    const mockRel = r.images.mock;
    if (r.kind === 'ok' && mockRel) {
      try {
        r.mismatch = await diff(join(outDir, mockRel), join(outDir, rel('light-desktop')), join(outDir, rel('diff')));
        r.images.diff = rel('diff');
      } catch (err) {
        r.error = `diff failed: ${firstLine(err)}`;
      }
    }
    results.push(r);
  }
  await writeFile(join(outDir, 'report.html'), renderReport(template, results, new Date().toISOString()));
  return results;
}

/**
 * True when any row could not shoot the site: the run exits non-zero, a broken site is not green.
 * @param {readonly Result[]} results
 */
export const siteBroken = (results) => results.some((r) => r.kind === 'site unavailable');

const TYPES = /** @type {Record<string, string>} */ ({
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
});

/** Evaluated in the page: elements rounder than the 2px radius ceiling (circles ≤ 12px are the status dot). */
function findRadius() {
  const corners = /** @type {const} */ ([
    'borderTopLeftRadius',
    'borderTopRightRadius',
    'borderBottomLeftRadius',
    'borderBottomRightRadius',
  ]);
  /** @type {Map<string, { what: string, radius: string }>} */
  const seen = new Map();
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (Math.max(...corners.map((k) => parseFloat(cs[k]) || 0)) <= 2) continue;
    const box = el.getBoundingClientRect();
    if (box.width === 0 || (box.width === box.height && box.width <= 12)) continue;
    const cls = [...el.classList].slice(0, 2).map((c) => `.${c}`);
    const what = `${el.parentElement?.tagName.toLowerCase() ?? ''} > ${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls.join('')}`;
    seen.set(`${what} ${cs.borderRadius}`, { what, radius: cs.borderRadius });
  }
  return [...seen.values()].slice(0, 20);
}

/**
 * Hover the Zag root around `selector` and wait until its machine runs: a click that lands before the
 * lazy mount (D-Z17) can be lost, so every open step starts from a live machine. No root: nothing to wait for.
 * @param {import('playwright-core').Page} page
 * @param {string} selector
 */
async function startMachine(page, selector) {
  const root = page.locator(selector).first().locator('xpath=ancestor-or-self::*[@data-zag-root][1]');
  if (!(await root.count())) return;
  await root.hover({ timeout: 10_000 });
  const state = /** @type {string | null} */ (
    await root.evaluate(
      (el) =>
        new Promise((ok) => {
          const read = () => el.getAttribute('data-zag-state');
          const done = () => (read() === 'live' || read() === 'error') && ok(read());
          new MutationObserver(done).observe(el, { attributes: true, attributeFilter: ['data-zag-state'] });
          setTimeout(() => ok(read()), 8_000);
          done();
        }),
    )
  );
  if (state !== 'live') throw new Error(`Zag machine of ${selector} is "${state}", not live`);
}

/**
 * Real backend: playwright-core chromium; serves `designDir` over node:http on an ephemeral port (the
 * .dc.html exports need support.js); site theme via localStorage 'starlight-theme' + data-theme.
 * One browser for the shooter's lifetime, so `--watch` reruns stay cheap.
 * @param {string} designDir
 * @returns {Promise<Shooter>}
 */
export async function chromiumShooter(designDir) {
  const { chromium } = await import('playwright-core');
  const server = createServer((req, res) => {
    let file;
    try {
      file = normalize(join(designDir, decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)));
    } catch {
      res.writeHead(400).end(); // malformed %-escape
      return;
    }
    if (!file.startsWith(designDir + sep) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(undefined)));
  const addr = server.address();
  const base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}/`;
  const browser = await chromium.launch();
  /** @type {Map<string, { mtime: number, page: import('playwright-core').Page }>} */
  const mocks = new Map();

  return {
    async mock(ref, out) {
      const file = join(designDir, ref.file);
      if (!existsSync(file)) return false;
      const mtime = statSync(file).mtimeMs;
      // Cached: the shot is newer than its export, so the mock cannot have changed.
      if (existsSync(out) && statSync(out).mtimeMs > mtime) return true;
      let entry = mocks.get(ref.file);
      if (entry?.mtime !== mtime) {
        await entry?.page.close();
        const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
        await page.goto(base + encodeURIComponent(ref.file), { waitUntil: 'networkidle', timeout: 30_000 });
        await page.waitForTimeout(800); // support.js resolves dc-import asynchronously
        entry = { mtime, page };
        mocks.set(ref.file, entry);
      }
      const el = await entry.page.$(`[id="${ref.id}"]`);
      if (!el) return false;
      await el.screenshot({ path: out, timeout: 30_000 });
      return true;
    },

    async site(url, variant, out, opts) {
      const [theme, device] = variant.split('-');
      const viewport = device === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
      const page = await browser.newPage({ viewport });
      try {
        await page.emulateMedia({ reducedMotion: 'reduce' }); // open/close transitions settle instantly
        await page.addInitScript((t) => {
          try {
            localStorage.setItem('starlight-theme', t);
          } catch {
            // storage blocked: data-theme below still applies
          }
        }, theme ?? 'light');
        // A cold dev server reloads the page once after Vite's dependency optimisation; retry on that.
        for (let attempt = 1; ; attempt++) {
          try {
            await page.goto(url, { waitUntil: 'networkidle', timeout: 15_000 });
            await page.evaluate((t) => {
              document.documentElement.setAttribute('data-theme', t);
              document.querySelector('astro-dev-toolbar')?.remove(); // dev-only overlay, not part of the design
            }, theme ?? 'light');
            await page.waitForTimeout(300);
            if (opts?.open) {
              /** @type {readonly OpenStep[]} */
              const steps = Array.isArray(opts.open) ? opts.open : [opts.open];
              for (const step of steps) {
                await startMachine(page, step.click ?? step.hover ?? step.focus ?? step.type ?? '');
                if (step.click) await page.click(step.click, { timeout: 10_000 });
                else if (step.hover) await page.hover(step.hover, { timeout: 10_000 });
                else if (step.focus) await page.locator(step.focus).focus({ timeout: 10_000 });
                else if (step.type) await page.fill(step.type, step.text ?? '', { timeout: 10_000 });
                await page.waitForTimeout(250); // the machine's reaction to this step, before the next
              }
              await page.waitForTimeout(300); // let the open state (reduced motion: no animation) settle
            }
            const target = opts?.selector ? page.locator(opts.selector) : page;
            if (opts?.selector) {
              // A shot that never opens fails here with a name, not as a 30 s screenshot timeout.
              await page
                .locator(opts.selector)
                .first()
                .waitFor({ state: 'visible', timeout: 5_000 })
                .catch(() => {
                  throw new Error(`overlay never became visible: ${opts.selector}`);
                });
            }
            await target.screenshot({ path: out, ...(opts?.selector ? {} : { fullPage: true }), timeout: 10_000 });
            return variant === 'light-desktop' ? await page.evaluate(findRadius) : undefined;
          } catch (err) {
            if (attempt >= 2 || !String(err).includes('context was destroyed')) throw err;
          }
        }
      } finally {
        await page.close();
      }
    },

    async close() {
      await browser.close();
      await new Promise((ok) => server.close(() => ok(undefined)));
    },
  };
}

/** @type {Differ} */
export async function diffPng(a, b, out) {
  const [{ PNG }, { default: pixelmatch }] = await Promise.all([import('pngjs'), import('pixelmatch')]);
  const [ia, ib] = [PNG.sync.read(await readFile(a)), PNG.sync.read(await readFile(b))];
  const width = Math.min(ia.width, ib.width);
  const height = Math.min(ia.height, ib.height);
  const crop = (/** @type {import('pngjs').PNG} */ img) => {
    const c = new PNG({ width, height });
    PNG.bitblt(img, c, 0, 0, width, height, 0, 0);
    return c.data;
  };
  const d = new PNG({ width, height });
  const count = pixelmatch(crop(ia), crop(ib), d.data, width, height, { threshold: 0.1 });
  await writeFile(out, PNG.sync.write(d));
  return count / (width * height);
}

/**
 * CLI entry: one run, or rerun on change of pairs, theme source, design exports and example content.
 * @param {readonly string[]} argv
 * @returns {Promise<void>}
 */
export async function main(argv) {
  const args = parseArgs(argv);
  const designDir = join(ROOT, '.tmp/design');
  const outDir = join(ROOT, '.tmp/visual');
  const template = await readFile(new URL('report.html.tmpl', import.meta.url), 'utf8');
  const shoot = await chromiumShooter(designDir);

  const once = async () => {
    // Re-imported per run so an edited pairs.ts takes effect under --watch.
    const pairsUrl = pathToFileURL(join(ROOT, 'tests/visual/pairs.ts'));
    pairsUrl.search = `t=${Date.now()}`;
    /** @type {unknown} */
    const mod = await import(pairsUrl.href);
    const { PAIRS } = /** @type {{ PAIRS: readonly Pair[] }} */ (mod);
    const results = await run({ pairs: PAIRS, shoot, diff: diffPng, outDir, template, site: args.site });
    const bad = results.filter((r) => r.kind !== 'ok').length;
    console.error(`visual: ${results.length} rows (${bad} not ok) → ${join(outDir, 'report.html')}`);
    return results;
  };

  try {
    if (siteBroken(await once())) process.exitCode = 1;
  } catch (err) {
    await shoot.close(); // a failed first run must not leave Chromium and the design server behind
    throw err;
  }
  if (!args.watch) {
    await shoot.close();
    return;
  }

  // ponytail: every change reruns all site shots (seconds); mocks reshoot only when their export's mtime moved
  // (cache in chromiumShooter). Per-pair dependency tracking if the pair list grows past a few dozen.
  let timer = /** @type {NodeJS.Timeout | undefined} */ (undefined);
  let running = Promise.resolve();
  const dirs = ['packages/theme/src', 'examples/starlight/src', 'tests/visual', '.tmp/design'].map((d) =>
    join(ROOT, d),
  );
  const watchers = dirs
    .filter((d) => existsSync(d))
    .map((d) =>
      watch(d, { recursive: true }, (_event, name) => {
        if (d.endsWith('tests/visual') && name !== 'pairs.ts') return;
        clearTimeout(timer);
        timer = setTimeout(() => {
          // Wait out the dev server's HMR rebuild before shooting.
          running = running
            .then(() => new Promise((ok) => setTimeout(ok, 1000)))
            .then(async () => {
              await once();
            })
            .catch((err) => console.error(err));
        }, 500);
      }),
    );
  console.error(`visual: watching ${dirs.length} paths, Ctrl-C to stop`);
  process.once('SIGINT', () => {
    clearTimeout(timer);
    for (const w of watchers) w.close();
    running.then(() => shoot.close()).catch((err) => console.error(err));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
