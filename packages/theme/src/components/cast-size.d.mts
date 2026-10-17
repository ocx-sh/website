/**
 * `{ cols, rows }` from an asciicast header: v3 `term.cols`/`term.rows`, v2 `width`/`height`.
 * @param {string} header the cast's first line
 * @returns {{ cols: number, rows: number } | undefined} undefined for anything else
 */
export function castSize(header: string): {
    cols: number;
    rows: number;
} | undefined;
/**
 * Size of the cast served at base-relative `src` (`/casts/x.cast`) from `publicDir`, or undefined when
 * `src` is not root-relative or the file is missing (a cast fetched from elsewhere).
 * @param {string} src
 * @param {string | URL} publicDir
 */
export function publicCastSize(src: string, publicDir: string | URL): {
    cols: number;
    rows: number;
} | undefined;
/**
 * The size a Terminal (and the Skeleton standing in for it) uses: explicit props win, else the cast's
 * header (`publicCastSize`); rows are capped at `MAX_ROWS`.
 * @param {string | undefined} src
 * @param {string | URL} publicDir
 * @param {number | undefined} cols
 * @param {number | undefined} rows
 * @returns {{ cols: number | undefined, rows: number | undefined }}
 */
export function terminalSize(src: string | undefined, publicDir: string | URL, cols: number | undefined, rows: number | undefined): {
    cols: number | undefined;
    rows: number | undefined;
};
/** Tallest terminal: a recording taller than this plays in a scrolling 24-row terminal, as a real one does. */
export const MAX_ROWS: 24;
