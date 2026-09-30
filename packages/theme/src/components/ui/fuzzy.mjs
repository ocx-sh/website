// Fuzzy matching for Combobox (Track F, owner finding: "the search combobox does not support
// fuzzy searching"). A subsequence matcher ranks and highlights hits, with a one-typo fallback for
// near-misses a pure subsequence can't reach (a transposed or substituted letter). No dependency:
// combobox labels are short strings (list rows), so a linear scan and a small edit-distance check
// are plenty — a fuzzy-search library would outweigh what it replaces.
// ponytail: no diacritics/locale folding, no per-word tokenizer beyond splitting on non-alphanumerics.

/** @typedef {{ start: number, end: number }} Range half-open index range into the ORIGINAL text */
/** @typedef {{ score: number, ranges: Range[] }} Hit ranges sorted, non-overlapping */

/**
 * Greedy subsequence match: every character of `query`, in order, inside `text` (case-insensitive).
 * Tighter groupings and word-boundary starts score higher, so for query "cm", "CMake" (both letters
 * at a word start) outranks "cmark-cli" (also tight) which outranks "find_ocx_cm" (scattered, late).
 * @param {string} text @param {string} query
 * @returns {Hit | null}
 */
function subsequence(text, query) {
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  let ti = 0;
  let score = 0;
  let streak = 0;
  /** @type {Range[]} */
  const ranges = [];
  for (const ch of q) {
    const at = t.indexOf(ch, ti);
    if (at < 0) return null;
    const boundary = at === 0 || /[^a-z0-9]/i.test(text[at - 1] ?? '');
    streak = at === ti ? streak + 1 : 1;
    score += 10 - Math.min(at - ti, 9) + streak * 2 + (boundary ? 5 : 0);
    const last = ranges[ranges.length - 1];
    if (last && last.end === at) last.end = at + 1;
    else ranges.push({ start: at, end: at + 1 });
    ti = at + 1;
  }
  return { score, ranges };
}

/**
 * Levenshtein distance, capped: returns `cap + 1` as soon as the true distance is known to exceed `cap`.
 * @param {string} a @param {string} b @param {number} cap
 * @returns {number}
 */
function editDistance(a, b, cap) {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  /** @type {number[]} */
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const left = /** @type {number} */ (row[j - 1]);
      const up = /** @type {number} */ (prev[j]);
      const diag = /** @type {number} */ (prev[j - 1]);
      const v = Math.min(left + 1, up + 1, diag + cost);
      row.push(v);
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > cap) return cap + 1;
    prev = row;
  }
  return /** @type {number} */ (prev[b.length]);
}

/**
 * Typo-tolerant fallback for when `query` is not a subsequence of `text`: matches a whole word of
 * `text` within edit distance 1 of `query` (one insert/delete/substitute), so "cmka" still finds
 * "cmake". The whole word is highlighted; a per-character diff isn't worth the code for one typo.
 * Only tried for queries of 3+ characters — shorter ones have too many one-edit neighbours to be useful.
 * @param {string} text @param {string} query
 * @returns {Hit | null}
 */
function typoTolerant(text, query) {
  if (query.length < 3) return null;
  const q = query.toLowerCase();
  /** @type {Hit | null} */
  let best = null;
  for (const m of text.matchAll(/[a-z0-9]+/gi)) {
    const dist = editDistance(m[0].toLowerCase(), q, 1);
    if (dist > 1) continue;
    const start = m.index ?? 0;
    const candidate = { score: 6 - dist * 3, ranges: [{ start, end: start + m[0].length }] };
    if (!best || candidate.score > best.score) best = candidate;
  }
  return best;
}

/**
 * `text` scored against `query`: a subsequence match, else a one-typo fallback, else no match.
 * @param {string} text @param {string} query
 * @returns {Hit | null}
 */
export function fuzzyScore(text, query) {
  return subsequence(text, query) ?? typoTolerant(text, query);
}

/**
 * Match ranges for one of three filter modes. `contains`/`startsWith` score 0 (no ranking, just a
 * hit/no-hit test) so callers that sort by score keep the original order for them.
 * @param {string} text @param {string} query @param {'fuzzy' | 'contains' | 'startsWith'} [mode]
 * @returns {Hit | null}
 */
export function match(text, query, mode = 'fuzzy') {
  if (!query) return { score: 0, ranges: [] };
  if (mode === 'fuzzy') return fuzzyScore(text, query);
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  const at = mode === 'startsWith' ? (t.startsWith(q) ? 0 : -1) : t.indexOf(q);
  return at < 0 ? null : { score: 0, ranges: [{ start: at, end: at + query.length }] };
}

/**
 * `items` (each with a `label`) that match `query` under `mode`, best-first for `fuzzy`;
 * `contains`/`startsWith` keep the original order (their score is always 0, so the stable sort is a no-op).
 * @template {{ label: string }} T
 * @param {T[]} items @param {string} query @param {'fuzzy' | 'contains' | 'startsWith'} [mode]
 * @returns {T[]}
 */
export function filterItems(items, query, mode = 'fuzzy') {
  if (!query) return items;
  return items
    .map((item, index) => ({ item, index, hit: match(item.label, query, mode) }))
    .filter(
      /** @returns {r is { item: T, index: number, hit: Hit }} */
      (r) => r.hit !== null,
    )
    .sort((a, b) => b.hit.score - a.hit.score || a.index - b.index)
    .map((r) => r.item);
}

/**
 * `text` split into segments for rendering: `{ text, mark: true }` for each matched range, plain
 * segments between them. `ranges` must be sorted and non-overlapping — what `match` returns is.
 * @param {string} text @param {Range[]} ranges
 * @returns {{ text: string, mark: boolean }[]}
 */
export function highlight(text, ranges) {
  if (!ranges.length) return [{ text, mark: false }];
  /** @type {{ text: string, mark: boolean }[]} */
  const segments = [];
  let pos = 0;
  for (const { start, end } of ranges) {
    if (start > pos) segments.push({ text: text.slice(pos, start), mark: false });
    segments.push({ text: text.slice(start, end), mark: true });
    pos = end;
  }
  if (pos < text.length) segments.push({ text: text.slice(pos), mark: false });
  return segments;
}
