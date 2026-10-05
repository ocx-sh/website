// The deploy sequence over an injected storage client: claim and layout checks, listing, ordered
// uploads, HTML prune. `index.mjs` owns the environment, the files GitHub reads and the exit code.
import { readFile } from 'node:fs/promises';
import { check, defaultPath } from '../../../packages/theme/src/check/index.mjs';
import { pagefindProblem } from '../../../packages/theme/src/check/pagefind.mjs';
import { zoneName } from '../../../packages/theme/src/registry.mjs';
import { findSite, previewUrl, previewZone } from '../../../scripts/previews/sites.mjs';
import { listRecursive, remove, StorageError, upload, walkDist } from './storage.mjs';

/** @typedef {import('../../../packages/theme/src/registry.mjs').Nav} Nav */
/** @typedef {import('./storage.mjs').StorageClient} StorageClient */
/** @typedef {import('./storage.mjs').StorageEntry} StorageEntry */
/** @typedef {import('./storage.mjs').DistFile} DistFile */

/**
 * @typedef {object} DeployInputs
 * @property {string} dist build output directory; its root maps to `path`
 * @property {string} [path] public path `dist` maps to; default the repo's shortest claim
 * @property {boolean} dryRun list and plan, write nothing
 * @property {string} [preview] preview site name or slug; deploys to that site's preview zone at `/`
 * @property {boolean} forcePrune delete past the prune cap
 */

/**
 * @typedef {object} DeployOptions
 * @property {DeployInputs} inputs
 * @property {string} repo `ocx-sh/<name>`, from `GITHUB_REPOSITORY`
 * @property {Nav} nav
 * @property {Omit<StorageClient, 'zone'>} storage endpoint, key and injected `fetch`; the zone is derived here
 * @property {(line: string) => void} [log]
 * @property {(ms: number) => Promise<void>} [sleep] injected in tests so retries do not wait
 */

/**
 * @typedef {object} DeployResult
 * @property {string} url
 * @property {number} uploaded files written (0 in a dry run)
 * @property {number} deleted files deleted (0 in a dry run)
 * @property {{ uploads: number, deletes: number }} [planned] dry run only
 */

const ATTEMPTS = 3;
const BACKOFF_MS = 500;
const PARALLEL = 8;
const ERROR_PAGE = 'bunnycdn_errors/404.html';
const PUBLIC_ORIGIN = 'https://ocx.sh';
const PREVIEW_ZONE_PREFIX = 'sh-ocx-preview-';
const PRUNE_CAP_MIN_LISTED = 10;

/** @param {number} ms */
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Network failures (no response), 5xx and 429 are worth another attempt; any other 4xx is final.
 * @param {unknown} err
 * @returns {boolean}
 */
function retryable(err) {
  return err instanceof StorageError && (err.status === 0 || err.status === 429 || err.status >= 500);
}

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @param {(ms: number) => Promise<void>} sleep
 * @returns {Promise<T>}
 */
async function retrying(fn, sleep) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= ATTEMPTS || !retryable(err)) throw err;
      await sleep(BACKOFF_MS * attempt);
    }
  }
}

/**
 * Run `fn` over `items`, at most `limit` at a time. After a failure no new item starts; the items
 * already running finish first, so nothing is still in flight when this rejects.
 * @template T
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T) => Promise<void>} fn
 * @returns {Promise<void>}
 */
async function pool(items, limit, fn) {
  let next = 0;
  let failure = /** @type {{ err: unknown } | undefined} */ (undefined);
  const worker = async () => {
    while (!failure && next < items.length) {
      try {
        await fn(/** @type {T} */ (items[next++]));
      } catch (err) {
        failure ??= { err };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (failure) throw failure.err;
}

/**
 * Where the deploy goes. A preview run reaches only its own `sh-ocx-preview-` zone and a production
 * run never reaches one, so a mix-up cannot overwrite the wrong site.
 * @param {DeployOptions} options
 * @returns {{ zone: string, path: string, url: string, preview: boolean }}
 */
function resolveTarget({ inputs, repo, nav }) {
  if (inputs.preview) {
    if (inputs.path) throw new Error('preview and path cannot be combined; a preview deploys at /');
    const site = findSite(inputs.preview);
    return { zone: previewZone(site), path: '/', url: previewUrl(site), preview: true };
  }
  const zone = zoneName(repo);
  if (zone.startsWith(PREVIEW_ZONE_PREFIX))
    throw new Error(`zone ${zone} is a preview zone; set preview to deploy there`);
  const path = inputs.path || defaultPath(nav, repo) || '';
  return { zone, path, url: `${PUBLIC_ORIGIN}${path}`, preview: false };
}

/**
 * The upload phase of a dist file. Assets go first so that no page ever references a missing one;
 * the top-level `pagefind/` files (entry, loader, wasm) follow; HTML, 404 page included, is last.
 * Hashed chunks in subdirectories of `pagefind/` are assets.
 * @param {string} distPath
 * @returns {0 | 1 | 2}
 */
function phaseOf(distPath) {
  if (distPath.endsWith('.html')) return 2;
  return /^pagefind\/[^/]+$/.test(distPath) ? 1 : 0;
}

/**
 * Stale HTML: listed under the path, not uploaded now, and not in another repo's claim subtree or the
 * error-page directory. Non-HTML is never stale, so a deploy never deletes an asset.
 * @param {object} args
 * @param {{ rel: string, entry: StorageEntry }[]} args.listed files listed under the path
 * @param {Set<string>} args.uploaded zone-relative paths written by this deploy
 * @param {string} args.path
 * @param {Nav} args.nav
 * @param {string} args.repo the deploying repo: only other repos' claims under the path are spared
 * @returns {{ scope: { rel: string, entry: StorageEntry }[], stale: { rel: string, entry: StorageEntry }[] }}
 *   `scope` is every listed HTML file the prune may touch; `stale` the part of it to delete
 */
function planPrune({ listed, uploaded, path, nav, repo }) {
  const nested = nav.claims.filter((c) => c.repo !== repo && c.path.startsWith(path)).map((c) => c.path.slice(1));
  const scope = listed.filter(
    ({ rel }) => rel.endsWith('.html') && !rel.startsWith('bunnycdn_errors/') && !nested.some((n) => rel.startsWith(n)),
  );
  return { scope, stale: scope.filter(({ rel }) => !uploaded.has(rel)) };
}

/**
 * The refusal when a prune would delete more than half of at least 10 listed HTML files, which
 * means a wrong `dist` or `path` far more often than a real cleanup.
 * @param {number} listed HTML files the prune may touch
 * @param {number} stale HTML files it would delete
 * @param {boolean} force
 * @returns {string | undefined}
 */
function pruneCap(listed, stale, force) {
  if (force || listed < PRUNE_CAP_MIN_LISTED || stale * 2 <= listed) return undefined;
  return `prune would delete ${stale} of ${listed} listed HTML files, more than half; uploads are done and stay, nothing was deleted. Check dist and path, or set force-prune: true to delete them`;
}

/**
 * The dist problems a preview still gets: the Pagefind index version when the site ships one. Claim
 * ownership, link resolution and layout belong to a claimed path, which a preview has none of.
 * @param {DistFile[]} files
 * @returns {Promise<{ file: string, problem: string }[]>}
 */
async function checkPreview(files) {
  const entry = files.find((f) => f.path === 'pagefind/pagefind-entry.json');
  const problem = entry && pagefindProblem(await readFile(entry.absolute, 'utf8'));
  return problem ? [{ file: 'pagefind/pagefind-entry.json', problem }] : [];
}

/**
 * Deploy `dist` to the repo's storage zone. Throws on any failure; the message never contains the key.
 * @param {DeployOptions} options
 * @returns {Promise<DeployResult>}
 */
export async function deploy(options) {
  const { inputs, repo, nav, storage, log = () => {}, sleep = wait } = options;

  // Steps 1 and 2: nothing here sends a request.
  if (!storage.accessKey) throw new Error('storage-key is empty; pass the repository secret BUNNY_STORAGE_KEY');
  const { zone, path, url, preview } = resolveTarget(options);
  const files = await walkDist(inputs.dist);
  const problems = preview ? await checkPreview(files) : check({ dist: inputs.dist, nav, repo, path });
  if (problems.length > 0) {
    throw new Error(`dist check failed:\n${problems.map((p) => `  ${p.file}: ${p.problem}`).join('\n')}`);
  }
  if (!files.some((f) => f.path === 'index.html')) throw new Error('dist/index.html is required');

  const base = path.slice(1);
  const remoteOf = (/** @type {DistFile} */ f) => (f.path === '404.html' ? ERROR_PAGE : `${base}${f.path}`);
  const phases = [0, 1, 2].map((n) => files.filter((f) => phaseOf(f.path) === n));
  const uploaded = new Set(files.map(remoteOf));

  // Step 3. ponytail: a 404 on the root listing is read as "nothing deployed here yet"; real Bunny
  // may answer that case differently (unverified). A 404 on a nested directory, or any other failure,
  // is fatal: it would otherwise read as an empty listing and silently skip the prune.
  const client = { ...storage, zone };
  const entries = await retrying(() => listRecursive(client, base.replace(/\/$/, ''), { emptyIfMissing: true }), sleep);
  const root = `/${zone}/`;
  const listed = entries
    .filter((e) => !e.IsDirectory)
    .map((entry) => ({ rel: `${entry.Path.slice(root.length)}${entry.ObjectName}`, entry }));
  // A preview zone holds one site: no other claim's subtree to spare.
  const { scope, stale } = planPrune({ listed, uploaded, path, repo, nav: preview ? { ...nav, claims: [] } : nav });
  const capped = pruneCap(scope.length, stale.length, inputs.forcePrune);

  if (inputs.dryRun) {
    if (capped) throw new Error(`dry run: ${capped}`);
    for (const f of phases.flat()) log(`would PUT ${remoteOf(f)}`);
    for (const s of stale) log(`would DELETE ${s.rel}`);
    return { url, uploaded: 0, deleted: 0, planned: { uploads: files.length, deletes: stale.length } };
  }

  // Steps 4 and 5: a barrier between phases, so every asset is written before any page.
  let written = 0;
  for (const group of phases) {
    await pool(group, PARALLEL, async (f) => {
      const body = await readFile(f.absolute);
      await retrying(() => upload(client, remoteOf(f), body), sleep);
      written++;
    });
  }
  log(`uploaded ${written} files`);

  // Step 6. The uploads above stay when the cap refuses: every page is whole.
  if (capped) throw new Error(capped);
  // A failed delete never stops the others: the leftover HTML is whole and the next deploy retries it.
  let deleted = 0;
  /** @type {string[]} */
  const failed = [];
  await pool(stale, PARALLEL, async ({ rel, entry }) => {
    try {
      // A retry after a DELETE that succeeded but whose response was lost answers 404: gone is gone.
      await retrying(
        () =>
          remove(client, entry).catch((err) => {
            if (!(err instanceof StorageError && err.status === 404)) throw err;
          }),
        sleep,
      );
      deleted++;
    } catch (err) {
      failed.push(`${rel}: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
  if (failed.length > 0) {
    throw new Error(
      `prune failed for ${failed.length} of ${stale.length} stale files; they stay until the next deploy:\n${failed.join('\n')}`,
    );
  }
  log(`deleted ${deleted} stale files`);
  return { url, uploaded: written, deleted };
}
