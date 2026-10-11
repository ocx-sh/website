// Terminal size from a recorded cast's header line, read at build so the player's height is reserved
// before it loads (Terminal.astro).
import { closeSync, openSync, readSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * `{ cols, rows }` from an asciicast header: v3 `term.cols`/`term.rows`, v2 `width`/`height`.
 * @param {string} header the cast's first line
 * @returns {{ cols: number, rows: number } | undefined} undefined for anything else
 */
export function castSize(header) {
  /** @type {unknown} */
  let h;
  try {
    h = JSON.parse(header);
  } catch {
    return undefined;
  }
  if (typeof h !== 'object' || h === null) return undefined;
  const { term, width, height } =
    /** @type {{ term?: { cols?: unknown, rows?: unknown }, width?: unknown, height?: unknown }} */ (h);
  const [cols, rows] = term ? [term.cols, term.rows] : [width, height];
  return Number.isInteger(cols) && Number.isInteger(rows) && Number(cols) > 0 && Number(rows) > 0
    ? { cols: Number(cols), rows: Number(rows) }
    : undefined;
}

/**
 * Size of the cast served at base-relative `src` (`/casts/x.cast`) from `publicDir`, or undefined when
 * `src` is not root-relative or the file is missing (a cast fetched from elsewhere).
 * @param {string} src
 * @param {string | URL} publicDir
 */
export function publicCastSize(src, publicDir) {
  if (!src.startsWith('/') || src.startsWith('//')) return undefined;
  const dir =
    publicDir instanceof URL ? publicDir : pathToFileURL(publicDir.endsWith('/') ? publicDir : `${publicDir}/`);
  let fd;
  try {
    fd = openSync(new URL(src.slice(1), dir), 'r');
  } catch {
    return undefined;
  }
  try {
    // The header is one short JSON line; a recording can be megabytes, so read only its head.
    const buf = Buffer.alloc(4096);
    const n = readSync(fd, buf, 0, buf.length, 0);
    return castSize(buf.toString('utf8', 0, n).split('\n', 1)[0] ?? '');
  } finally {
    closeSync(fd);
  }
}
