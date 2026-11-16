// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The OCX Authors

// The one place the matching rules live: the remark plugin links with it, a consumer's lint finds banned
// synonyms with it, so both accept exactly the same text.
import './types.mjs';

// A form never starts after a letter, digit or one of `_ - . / @ $ : #` and never ends before a letter, digit
// or one of `_ - / @` or a `.` + letter: `multi-platform`, `ocx-mirror`, `index.ocx.sh`, `$OCX_HOME`,
// `--platform` and `metadata.json` hold no term.
const LEFT = String.raw`(?<![\p{L}\p{N}_\-./@$:#])`;
const RIGHT = String.raw`(?![\p{L}\p{N}_\-/@])(?!\.\p{L})`;

/** @param {string} form */
const escape = (form) => form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A form with an uppercase letter matches exactly, an all-lowercase one in any case. @param {string} form */
const exact = (form) => form !== form.toLowerCase();
/** Whitespace of any width, a soft line break included, is one space. @param {string} text */
const squash = (text) => text.replace(/\s+/g, ' ');

/**
 * @param {string[]} forms
 * @param {string} flags
 * @returns {RegExp | null}
 */
function alternation(forms, flags) {
  if (!forms.length) return null;
  const longest = [...forms].sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
  const body = longest.map((f) => escape(f).replace(/ /g, String.raw`\s+`)).join('|');
  return new RegExp(`${LEFT}(?:${body})${RIGHT}`, flags);
}

/**
 * A finder over the glossary: every term form in a string, longest first, with the `except` phrases
 * consuming their text so `package manager` holds no `package`.
 *
 * Only forms listed in `variants` match (no stemming); the canonical `term` is display text. A form with an
 * uppercase letter (`OCI`, `Sigstore`) matches exactly, an all-lowercase one in any case; the hit keeps the
 * source text.
 *
 * `match: 'avoid'` finds each term's banned synonyms instead, for a lint over source prose; the hit's `id` is
 * the term the form should be replaced by.
 * @param {readonly import('./types.mjs').GlossaryTerm[]} terms
 * @param {{ match?: 'variants' | 'avoid' }} [options]
 * @returns {(text: string) => import('./types.mjs').GlossaryHit[]}
 */
export function matcher(terms, { match = 'variants' } = {}) {
  /** @type {Map<string, string | null>} form key to term id, `null` for an except phrase */
  const sensitive = new Map();
  /** @type {Map<string, string | null>} */
  const insensitive = new Map();
  /** @param {string} form @param {string | null} id */
  const add = (form, id) => {
    const map = exact(form) ? sensitive : insensitive;
    const key = exact(form) ? squash(form) : squash(form).toLowerCase();
    if (!map.has(key)) map.set(key, id);
  };
  for (const t of terms) {
    for (const form of (match === 'avoid' ? t.avoid : t.variants) ?? []) add(form, t.id);
    for (const phrase of t.except ?? []) add(phrase, null);
  }
  const cased = alternation([...sensitive.keys()], 'gu');
  const folded = alternation([...insensitive.keys()], 'giu');

  return (text) => {
    /** @type {{ id: string | null, text: string, start: number, end: number }[]} */
    const found = [];
    for (const [re, map, fold] of /** @type {const} */ ([
      [cased, sensitive, false],
      [folded, insensitive, true],
    ])) {
      if (!re) continue;
      for (const m of text.matchAll(re)) {
        const key = fold ? squash(m[0]).toLowerCase() : squash(m[0]);
        const id = map.get(key);
        if (id !== undefined) found.push({ id, text: m[0], start: m.index, end: m.index + m[0].length });
      }
    }
    // Earliest first, the longer of two forms starting together; a form overlapping one already taken is dropped.
    found.sort((a, b) => a.start - b.start || b.end - a.end);
    /** @type {import('./types.mjs').GlossaryHit[]} */
    const hits = [];
    let until = 0;
    for (const f of found) {
      if (f.start < until) continue;
      until = f.end;
      if (f.id !== null) hits.push({ id: f.id, text: f.text, start: f.start, end: f.end });
    }
    return hits;
  };
}
