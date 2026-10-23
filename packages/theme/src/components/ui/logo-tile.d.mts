/**
 * Up to two initials for a tile, from a bare name: the first character of the first two
 * alphanumeric segments (`cmake-tools` → `CT`), else the name's first two characters (`cmake` → `CM`).
 * A pure function of its input, so server and client render the same tile.
 * @param {string} name
 * @returns {string}
 */
export function monogramInitials(name: string): string;
/**
 * The hue index (0-3, `--ocx-color-monogram-<n>`) for `seed`: a djb2 hash, pure like the initials.
 * @param {string} seed
 * @returns {0 | 1 | 2 | 3}
 */
export function monogramHue(seed: string): 0 | 1 | 2 | 3;
/**
 * Fill a tile in place (a clone of a LogoTile rendered with no name and no `src`): the monogram, the
 * hue and the logo, with the failure state and the fallback retry reset, so a recycled tile
 * starts clean. `src` is used as given (join the base yourself).
 * @param {Element} tile
 * @param {{ name: string, seed?: string, src?: string | null, fallback?: string | null }} fill `seed` defaults to `name`; `fallback` is tried once if `src` fails
 */
export function fillLogoTile(tile: Element, { name, seed, src, fallback }: {
    name: string;
    seed?: string;
    src?: string | null;
    fallback?: string | null;
}): void;
export { install } from "./logo-tile-install.mjs";
