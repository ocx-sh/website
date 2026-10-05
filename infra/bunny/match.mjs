// Simulates Bunny edge-rule matching over a planned rule set. Pure: no network, no credentials.

import { ACTION, MATCH, TRIGGER, patternRegExp } from './rules.mjs';

/** @typedef {import('./rules.mjs').BunnyRule} BunnyRule */

/** `ActionType` values that route a request (redirect, origin URL, origin storage): first match wins. */
const ORIGIN_ACTIONS = new Set([ACTION.Redirect, ACTION.OriginUrl, ACTION.OriginStorage]);

/**
 * @typedef {object} Probe
 * @property {string} host
 * @property {string} path
 * @property {number} status
 */

/**
 * @typedef {object} Match
 * @property {string | null} origin id of the winning origin rule, null when none wins (the pull zone's default origin)
 * @property {string[]} headers ids of every matching non-origin rule (headers, cache times), in rule order
 */

/**
 * @param {number} type a Bunny match type: Any 0, All 1, None 2
 * @param {boolean[]} hits
 * @returns {boolean}
 */
function combine(type, hits) {
  if (type === MATCH.All) return hits.every(Boolean);
  if (type === MATCH.None) return !hits.some(Boolean);
  return hits.some(Boolean);
}

/**
 * @param {BunnyRule} rule
 * @param {string} url `https://<host><path>`
 * @param {number} status
 * @returns {boolean}
 */
function matches(rule, url, status) {
  const hits = rule.Triggers.map((t) => {
    const subject = t.Type === TRIGGER.StatusCode ? String(status) : url;
    return combine(
      t.PatternMatchingType,
      t.PatternMatches.map((p) => patternRegExp(p).test(subject)),
    );
  });
  return combine(rule.TriggerMatchingType, hits);
}

/**
 * Which rules a request would hit: the first matching origin rule in plan order, and every matching
 * other rule.
 * @param {readonly BunnyRule[]} rules in plan order, as `planRules(zone)` returns them
 * @param {Probe} probe
 * @returns {Match}
 */
export function matchProbe(rules, { host, path, status }) {
  const url = `https://${host}${path}`;
  const hit = rules.filter((r) => r.Enabled !== false && matches(r, url, status));
  const id = (/** @type {BunnyRule} */ r) => r.Description.replace(/^ocx:/, '');
  const winner = hit.find((r) => ORIGIN_ACTIONS.has(r.ActionType));
  return {
    origin: winner ? id(winner) : null,
    headers: hit.filter((r) => !ORIGIN_ACTIONS.has(r.ActionType)).map(id),
  };
}
