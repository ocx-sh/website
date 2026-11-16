// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The OCX Authors

import './types.mjs';

const MAX_WORDS = 25;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// A docs route with an optional fragment (`guides/install/#cli`), or an absolute URL.
const LEARN_MORE = /^(?:https?:\/\/\S+|[a-z0-9][\w./-]*\/(?:#[\w-]+)?)$/;
const KEYS = new Set([
  'id',
  'term',
  'variants',
  'definition',
  'learnMore',
  'category',
  'avoid',
  'except',
  'excludePages',
]);

/**
 * The key two forms collide on: an exact form by its text, a lowercase one in any case.
 * @param {string} form
 */
const key = (form) => (form === form.toLowerCase() ? form.toLowerCase() : form);

/**
 * Problems in glossary data, one readable line each; an empty array means the data is sound.
 * Checks the row shape, unique ids, no form (variant, avoid or except phrase) claimed twice, definitions of at
 * most 25 words and `learnMore` in the route or URL form.
 * @param {unknown} terms
 * @returns {string[]}
 */
export function validate(terms) {
  if (!Array.isArray(terms)) return ['glossary data is not an array'];
  /** @type {string[]} */
  const errors = [];
  /** @type {Map<string, string>} */
  const ids = new Map();
  /** @type {Map<string, string>} */
  const forms = new Map();
  /** @param {string} where @param {unknown} list @param {boolean} claim */
  const strings = (where, list, claim, id = '') => {
    if (!Array.isArray(list) || list.some((s) => typeof s !== 'string' || !s.trim())) {
      errors.push(`${where}: must be an array of non-empty strings`);
      return;
    }
    const names = /** @type {string[]} */ (list);
    for (const form of names) {
      if (!claim) continue;
      const prior = forms.get(key(form));
      if (prior !== undefined && prior !== id) errors.push(`${where}: "${form}" is already a form of "${prior}"`);
      else if (prior === id && names.filter((f) => key(f) === key(form)).length > 1)
        errors.push(`${where}: "${form}" is listed twice`);
      else forms.set(key(form), id);
    }
  };

  /** @type {[string, string][]} avoid forms with where they are listed */
  const banned = [];
  /** @type {unknown[]} */ (terms).forEach((row, i) => {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      errors.push(`#${i}: not an object`);
      return;
    }
    const t = /** @type {Record<string, unknown>} */ (row);
    const id = typeof t['id'] === 'string' ? t['id'] : '';
    const at = id || `#${i}`;
    for (const k of Object.keys(t)) if (!KEYS.has(k)) errors.push(`${at}: unknown field "${k}"`);
    for (const k of ['id', 'term', 'definition', 'learnMore', 'category'])
      if (typeof t[k] !== 'string' || !String(t[k]).trim()) errors.push(`${at}: "${k}" must be a non-empty string`);
    if (id) {
      if (!ID.test(id)) errors.push(`${at}: id must be lowercase words joined by hyphens`);
      if (ids.has(id)) errors.push(`${at}: duplicate id`);
      ids.set(id, at);
    }
    if (typeof t['definition'] === 'string') {
      const words = t['definition'].trim().split(/\s+/).length;
      if (words > MAX_WORDS) errors.push(`${at}: definition has ${words} words, the limit is ${MAX_WORDS}`);
    }
    if (typeof t['learnMore'] === 'string' && !LEARN_MORE.test(t['learnMore']))
      errors.push(
        `${at}: learnMore "${t['learnMore']}" is neither a docs route ending in "/" (with an optional #fragment) nor an http(s) URL`,
      );
    strings(`${at}.variants`, t['variants'], true, at);
    if (Array.isArray(t['variants']) && !t['variants'].length) errors.push(`${at}: variants is empty`);
    if (t['avoid'] !== undefined) {
      strings(`${at}.avoid`, t['avoid'], false);
      if (Array.isArray(t['avoid'])) for (const f of t['avoid']) if (typeof f === 'string') banned.push([f, at]);
    }
    if (t['except'] !== undefined) strings(`${at}.except`, t['except'], false);
    if (t['excludePages'] !== undefined) {
      const pages = t['excludePages'];
      if (!Array.isArray(pages) || !pages.length || pages.some((s) => typeof s !== 'string' || !s.trim()))
        errors.push(`${at}.excludePages: must be a non-empty array of non-empty strings`);
      else
        for (const p of /** @type {string[]} */ (pages))
          if (/^[a-z][a-z0-9+.-]*:/i.test(p) || p.startsWith('//') || p.split('/').includes('..'))
            errors.push(`${at}.excludePages: "${p}" must be a docs route prefix, not a URL or a path with ".."`);
    }
  });
  // A banned synonym that is also a term's variant would be linked and flagged at once.
  for (const [form, at] of banned) {
    const owner = forms.get(key(form));
    if (owner !== undefined) errors.push(`${at}.avoid: "${form}" is a form of "${owner}"`);
  }
  return errors;
}
