// Builds `site/dist` once per vitest run (`global-setup.ts`) for the dist-reading tests. A stamp
// skips the build while `dist` is newer than its inputs; a lock directory under the OS temp dir
// (keyed by the repo path) serialises concurrent runs, because the build wipes `dist`.
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const root = new URL('../../', import.meta.url).pathname;
export const dist = `${root}site/dist/`;
const key = createHash('sha256').update(root).digest('hex').slice(0, 12);
const lock = join(tmpdir(), `ocx-site-build-${key}.lock`);
const stamp = join(tmpdir(), `ocx-site-build-${key}.stamp`);
const STALE_MS = 5 * 60_000;
/** What the build reads: `site/` minus its outputs, the theme source (incl. nav.json), the legacy record. */
const INPUTS = [`${root}site`, `${root}packages/theme/src`, `${root}infra/bunny/legacy.json`];
const SKIP = new Set(['dist', 'node_modules', '.astro']);

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
};

function stale(dir: string, staleMs: number): boolean {
  const aged = () => Date.now() - statSync(dir).mtimeMs > staleMs;
  try {
    return aged() || !alive(Number(readFileSync(join(dir, 'pid'), 'utf8')));
  } catch {
    // No pid file: the owner is between mkdir and its write, or died there; age decides.
    try {
      return aged();
    } catch {
      return false; // Lock vanished: the next mkdir wins.
    }
  }
}

/**
 * Takes the lock directory `dir`, waiting while a live owner holds it. A stale lock is renamed to a
 * unique name (atomic: one contender wins, the rest see ENOENT) and removed, then the loop retries.
 * ponytail: a contender that judged the old lock stale can still rename a fresh one made in
 * between; the stamp check below keeps that to one redundant build. Per-lock tokens if it ever bites.
 */
export async function acquireLock(dir: string, staleMs = STALE_MS, pollMs = 500): Promise<void> {
  for (;;) {
    try {
      mkdirSync(dir);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      if (!stale(dir, staleMs)) {
        await new Promise((r) => setTimeout(r, pollMs));
        continue;
      }
      const gone = `${dir}.stale-${randomUUID()}`;
      try {
        renameSync(dir, gone);
      } catch (re) {
        if ((re as NodeJS.ErrnoException).code === 'ENOENT') continue; // another contender broke it first
        throw re;
      }
      rmSync(gone, { recursive: true, force: true });
      continue;
    }
    writeFileSync(join(dir, 'pid'), String(process.pid));
    return;
  }
}

/** The newest mtime under `path`, skipping build outputs; 0 when it does not exist. */
function newest(path: string): number {
  let st;
  try {
    st = statSync(path);
  } catch {
    return 0;
  }
  if (!st.isDirectory()) return st.mtimeMs;
  return readdirSync(path, { withFileTypes: true })
    .filter((e) => !SKIP.has(e.name))
    .reduce((m, e) => Math.max(m, newest(join(path, e.name))), st.mtimeMs);
}

/** True while `dist` was built (stamp = build start time) after the last change to any input. */
export function isFresh(stampFile = stamp, inputs = INPUTS, distIndex = `${dist}index.html`): boolean {
  try {
    const started = Number(readFileSync(stampFile, 'utf8'));
    return existsSync(distIndex) && inputs.every((i) => newest(i) <= started);
  } catch {
    return false;
  }
}

export async function buildSite(): Promise<void> {
  if (isFresh()) return;
  await acquireLock(lock);
  try {
    if (isFresh()) return; // a concurrent run built it while this one waited
    rmSync(stamp, { force: true });
    const started = Date.now();
    execFileSync('pnpm', ['--filter', 'site', 'build'], {
      cwd: root,
      stdio: 'pipe',
      timeout: 600_000,
      maxBuffer: 64 * 1024 * 1024,
    });
    writeFileSync(stamp, String(started));
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}
