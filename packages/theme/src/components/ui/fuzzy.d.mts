/**
 * `text` scored against `query`: a subsequence match, else a one-typo fallback, else no match.
 * @param {string} text @param {string} query
 * @returns {Hit | null}
 */
export function fuzzyScore(text: string, query: string): Hit | null;
/**
 * Match ranges for one of three filter modes. `contains`/`startsWith` score 0 (no ranking, just a
 * hit/no-hit test) so callers that sort by score keep the original order for them.
 * @param {string} text @param {string} query @param {'fuzzy' | 'contains' | 'startsWith'} [mode]
 * @returns {Hit | null}
 */
export function match(text: string, query: string, mode?: "fuzzy" | "contains" | "startsWith"): Hit | null;
/**
 * `items` (each with a `label`) that match `query` under `mode`, best-first for `fuzzy`;
 * `contains`/`startsWith` keep the original order (their score is always 0, so the stable sort is a no-op).
 * @template {{ label: string }} T
 * @param {T[]} items @param {string} query @param {'fuzzy' | 'contains' | 'startsWith'} [mode]
 * @returns {T[]}
 */
export function filterItems<T extends {
    label: string;
}>(items: T[], query: string, mode?: "fuzzy" | "contains" | "startsWith"): T[];
/**
 * `text` split into segments for rendering: `{ text, mark: true }` for each matched range, plain
 * segments between them. `ranges` must be sorted and non-overlapping — what `match` returns is.
 * @param {string} text @param {Range[]} ranges
 * @returns {{ text: string, mark: boolean }[]}
 */
export function highlight(text: string, ranges: Range[]): {
    text: string;
    mark: boolean;
}[];
/**
 * half-open index range into the ORIGINAL text
 */
export type Range = {
    start: number;
    end: number;
};
/**
 * ranges sorted, non-overlapping
 */
export type Hit = {
    score: number;
    ranges: Range[];
};
