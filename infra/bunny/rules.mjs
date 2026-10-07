// Plans a zone's Bunny edge rules from legacy.json and nav.json (.agents/adr/adr_0002_phase2-bunny-cutover.md#d64-edge-rule-set-and-budget-prod-zone-at-the-flip).
// Pure: no network, no credentials.
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import nav from '@ocx-sh/theme/nav.json' with { type: 'json' };
import legacyData from './legacy.json' with { type: 'json' };
import { PUBLIC_HOST, REHEARSAL_HOST, ROOT_REPO, redirectTemplate, storageZoneName, zoneSpec } from './zones.mjs';

// Enum values read back from live rules (fixtures/p*-pullzone.json, M0 2026-10-05); 17 and the trigger types are
// verified by request behaviour, the rest by the owner's hand-made `sh-ocx-setup` rules.
/** Bunny `ActionType` values; `match.mjs` reads the routing ones from here. */
export const ACTION = {
  Redirect: 1,
  OriginUrl: 2,
  OverrideCacheTime: 3,
  SetResponseHeader: 5,
  SetRequestHeader: 6,
  OverrideBrowserCacheTime: 16,
  OriginStorage: 17,
};
export const TRIGGER = { Url: 0, StatusCode: 8 };
export const MATCH = { Any: 0, All: 1, None: 2 };

const MAX_PATTERNS = 5;
const MAX_TRIGGERS = 5;
/** Plan ceiling for one zone; the live limit is 50. */
const PLAN_CEILING = 40;
const IMMUTABLE = '31536000';
const ASSET_PATTERN = 'https://*/_astro/*';
const REDIRECT_STATUS = '302';
/** A host of one of our zones; an OriginUrl or prod Redirect pointing at one loops or leaks it. */
const ZONE_HOST = /^(?:ocx\.sh|next\.ocx\.sh|sh-ocx[a-z0-9-]*\.b-cdn\.net)$/;
/** Proxied directory claims whose bare form (`/team`) is a page of its own and needs a pattern too. */
const BARE_PROXY_DIRS = new Set(['/team/']);
/** Catalog pages that render untrusted package content: `/catalog/p/<pkg>` and `/catalog/index/<registry>/p/<pkg>`. */
const SANDBOX_PATHS = ['/catalog/p/*', '/catalog/index/*/p/*'];

/**
 * @typedef {object} Trigger
 * @property {number} Type
 * @property {number} PatternMatchingType
 * @property {string} Parameter1
 * @property {string[]} PatternMatches
 */

/**
 * A rule in the shape of the Bunny edge-rule API body.
 * @typedef {object} BunnyRule
 * @property {number} ActionType
 * @property {string} ActionParameter1
 * @property {string} ActionParameter2
 * @property {number} TriggerMatchingType
 * @property {boolean} Enabled
 * @property {string} Description `ocx:<id>`
 * @property {Trigger[]} Triggers
 */

/**
 * @typedef {object} LegacyEntry
 * @property {string} id
 * @property {string} repo
 * @property {string} mode `proxy` or `redirect`
 * @property {string} origin
 * @property {string[]} paths
 */

/**
 * @typedef {object} PlanInput
 * @property {{ entries: LegacyEntry[] }} [legacy] defaults to the committed `legacy.json`
 * @property {{ path: string, repo: string }[]} [claims] defaults to the claims of `nav.json`
 */

/** Refusal of a plan; every problem names the offending `ocx:<id>` rule. */
export class PlanError extends Error {
  /** @param {string[]} problems */
  constructor(problems) {
    super(problems.join('\n'));
    this.name = 'PlanError';
    this.problems = problems;
  }
}

/**
 * Patterns split across triggers: one trigger holds at most 5 and `MatchAny` ORs them, so the split
 * is invisible to matching.
 * @param {string[]} patterns
 * @returns {Trigger[]}
 */
function urlTriggers(patterns) {
  const triggers = [];
  for (let i = 0; i < patterns.length; i += MAX_PATTERNS)
    triggers.push({
      Type: TRIGGER.Url,
      PatternMatchingType: MATCH.Any,
      Parameter1: '',
      PatternMatches: patterns.slice(i, i + MAX_PATTERNS),
    });
  return triggers;
}

/**
 * @param {string} id
 * @param {string[]} patterns
 * @param {number} action
 * @param {string} p1 for `OriginStorage` the storage zone Id, which only `apply.mjs` knows: planned as ''
 * @param {string} [p2] for `OriginStorage` the storage zone name; the API refuses a rule whose name and Id disagree
 * @returns {BunnyRule}
 */
function rule(id, patterns, action, p1, p2 = '') {
  return {
    ActionType: action,
    ActionParameter1: p1,
    ActionParameter2: p2,
    TriggerMatchingType: MATCH.Any,
    Enabled: true,
    Description: `ocx:${id}`,
    Triggers: urlTriggers(patterns),
  };
}

/**
 * A cache rule for every `/_astro/` URL that answered 200: a transient 404 on a hashed URL must never
 * be pinned for a year.
 * @param {string} id
 * @param {number} action
 * @returns {BunnyRule}
 */
function assetRule(id, action) {
  return {
    ...rule(id, [ASSET_PATTERN], action, IMMUTABLE),
    TriggerMatchingType: MATCH.All,
    Triggers: [
      ...urlTriggers([ASSET_PATTERN]),
      { Type: TRIGGER.StatusCode, PatternMatchingType: MATCH.Any, Parameter1: '', PatternMatches: ['200'] },
    ],
  };
}

/**
 * Every host crossed with every path suffix, host first.
 * @param {string[]} hosts
 * @param {string[]} suffixes
 * @returns {string[]}
 */
function onHosts(hosts, suffixes) {
  return hosts.flatMap((h) => suffixes.map((s) => `https://${h}${s}`));
}

/**
 * The URL paths a path claims: `/x/` is the directory (`/x/*`, plus the bare `/x` when `bare`), anything
 * else is exact. A directory claim without its bare form leaves `/x` unrouted: the page `/x` is a page of its own.
 * @param {string} path
 * @param {boolean} bare
 * @returns {string[]}
 */
function expandPath(path, bare) {
  if (!path.endsWith('/')) return [path];
  return bare ? [path.slice(0, -1), `${path}*`] : [`${path}*`];
}

/**
 * @typedef {object} Origin
 * @property {number} order claimed-path length: longer sorts first
 * @property {BunnyRule} rule
 */

/**
 * @param {LegacyEntry} entry
 * @param {string[]} hosts
 * @returns {Origin}
 */
function legacyRule(entry, hosts) {
  const patterns = onHosts(
    hosts,
    entry.paths.flatMap((p) => expandPath(p, entry.mode === 'redirect' || BARE_PROXY_DIRS.has(p))),
  );
  const order = Math.max(...entry.paths.map((p) => p.length));
  if (entry.mode === 'proxy') return { order, rule: rule(entry.id, patterns, ACTION.OriginUrl, entry.origin) };
  if (entry.mode === 'redirect')
    return { order, rule: rule(entry.id, patterns, ACTION.Redirect, redirectTemplate(entry), REDIRECT_STATUS) };
  throw new PlanError([`ocx:${entry.id}: unknown mode "${entry.mode}"`]);
}

/**
 * One `OriginStorage` rule per claiming repo that is neither the root site nor in `legacy.json`.
 * @param {LegacyEntry[]} entries
 * @param {{ path: string, repo: string }[]} claims
 * @param {string[]} hosts
 * @returns {Origin[]}
 */
function repoRules(entries, claims, hosts) {
  const legacyRepos = new Set(entries.map((e) => e.repo));
  const repos = [...new Set(claims.map((c) => c.repo))].filter((r) => r !== ROOT_REPO && !legacyRepos.has(r));
  return repos.map((repo) => {
    const paths = claims.filter((c) => c.repo === repo).map((c) => c.path);
    const id = `repo-${storageZoneName(repo).replace(/^sh-ocx-/, '')}`;
    const patterns = onHosts(
      hosts,
      paths.flatMap((p) => expandPath(p, true)),
    );
    return {
      order: Math.max(...paths.map((p) => p.length)),
      rule: rule(id, patterns, ACTION.OriginStorage, '', storageZoneName(repo)),
    };
  });
}

/** @param {string} pattern a Bunny URL pattern: `*` is greedy across `/`, everything else literal, anchored */
export const patternRegExp = (pattern) =>
  new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*')}$`);

/** @param {BunnyRule} r @returns {string[]} */
const urlPatterns = (r) => r.Triggers.filter((t) => t.Type === TRIGGER.Url).flatMap((t) => t.PatternMatches);

/** Length of the literal path a URL pattern claims: the part after the host, up to the first `*`. */
const specificity = (/** @type {string} */ pattern) => (/^https:\/\/[^/]*([^*]*)/.exec(pattern)?.[1] ?? '').length;

/**
 * The pattern pairs of two rules that match a common URL, using each pattern with its `*` filled in as a probe.
 * @param {BunnyRule} a
 * @param {BunnyRule} b
 * @returns {{ pa: string, pb: string, probe: string }[]}
 */
function overlaps(a, b) {
  const found = [];
  for (const pa of urlPatterns(a))
    for (const pb of urlPatterns(b)) {
      const probe = [pa, pb]
        .map((p) => p.replaceAll('*', 'x'))
        .find((u) => patternRegExp(pa).test(u) && patternRegExp(pb).test(u));
      if (probe) found.push({ pa, pb, probe });
    }
  return found;
}

/**
 * The host of an absolute `https://` URL, lowercased without a port or trailing dot; undefined for anything else.
 * A regex on the raw string misses `https://OCX.SH` and `https://ocx.sh:443`, which still reach the zone.
 * @param {string} target
 * @returns {string | undefined}
 */
function hostOf(target) {
  try {
    const url = new URL(target);
    return url.protocol === 'https:' ? url.hostname.replace(/\.$/, '') : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Every refusal of a planned rule set, each naming its rule.
 * @param {BunnyRule[]} rules in plan order
 * @param {Origin[]} origins
 * @param {{ hosts: string[], prod: boolean }} zone
 * @returns {string[]}
 */
function problemsOf(rules, origins, { hosts, prod }) {
  /** @type {string[]} */
  const problems = [];
  if (rules.length > PLAN_CEILING) problems.push(`zone plans ${rules.length} rules, ceiling ${PLAN_CEILING}`);
  const seen = new Set();
  for (const r of rules) {
    const at = r.Description;
    if (seen.has(at)) problems.push(`${at}: duplicate Description`);
    seen.add(at);
    if (r.Triggers.length > MAX_TRIGGERS)
      problems.push(`${at}: ${r.Triggers.length} triggers, at most ${MAX_TRIGGERS}`);
    for (const t of r.Triggers.filter((x) => x.Type === TRIGGER.Url))
      for (const p of t.PatternMatches) {
        if (p === ASSET_PATTERN || hosts.some((h) => p.startsWith(`https://${h}/`))) continue;
        const authority = p.replace(/^https:\/\//, '').split('/')[0] ?? '';
        problems.push(
          authority.includes('*')
            ? `${at}: pattern ${p} has * before its path`
            : `${at}: pattern ${p} is outside the zone hosts ${hosts.join(', ')}`,
        );
      }
    const host = hostOf(r.ActionParameter1);
    if (r.ActionType === ACTION.OriginUrl && host !== undefined && ZONE_HOST.test(host))
      problems.push(`${at}: OriginUrl target host ${host} is a zone host and loops`);
    if (r.ActionType === ACTION.Redirect) {
      if (host === undefined)
        problems.push(`${at}: Redirect target ${r.ActionParameter1} is not an absolute https:// URL`);
      else if (prod && host.endsWith('.b-cdn.net'))
        problems.push(`${at}: prod Redirect target host ${host} is a b-cdn.net host`);
    }
  }
  origins.forEach((a, i) => {
    for (const b of origins.slice(i + 1)) {
      // `a` ranks first and wins every shared URL: that is only right while its pattern is the more specific.
      for (const { pa, pb, probe } of overlaps(a.rule, b.rule))
        if (specificity(pb) >= specificity(pa))
          problems.push(
            `${a.rule.Description} (${pa}) outranks ${b.rule.Description} (${pb}) on ${probe} but is not more specific; split the entry or order cannot decide`,
          );
    }
  });
  return problems;
}

/**
 * The rules of one zone, in apply order: asset cache (not on previews), `noindex`, `hsts` (prod),
 * `X-Frame-Options`, the catalog sandbox headers (not on previews), then the origin rules longest claimed path first. A preview zone gets `noindex`
 * and `X-Frame-Options` only. Throws a {@link PlanError} when a rule would loop, leak a zone host,
 * or make the winner of a request ambiguous.
 * @param {string} zone `dev`, `prod` or `preview:<slug>`
 * @param {PlanInput} [input]
 * @returns {BunnyRule[]}
 */
export function planRules(zone, { legacy = legacyData, claims = nav.claims } = {}) {
  const { hosts } = zoneSpec(zone);
  const preview = zone.startsWith('preview:');
  const prod = zone === 'prod';
  const header = (
    /** @type {string} */ id,
    /** @type {string[]} */ on,
    /** @type {string} */ name,
    /** @type {string} */ value,
  ) => rule(id, onHosts(on, ['/*']), ACTION.SetResponseHeader, name, value);
  const sandbox = (/** @type {string} */ id, /** @type {string} */ name, /** @type {string} */ value) =>
    rule(id, onHosts(hosts, SANDBOX_PATHS), ACTION.SetResponseHeader, name, value);
  const headers = [
    ...(preview
      ? []
      : [
          assetRule('assets-edge', ACTION.OverrideCacheTime),
          assetRule('assets-browser', ACTION.OverrideBrowserCacheTime),
        ]),
    header(
      'noindex',
      hosts.filter((h) => h !== PUBLIC_HOST),
      'X-Robots-Tag',
      'noindex, nofollow',
    ),
    ...(prod
      ? [
          header(
            'hsts',
            [PUBLIC_HOST, REHEARSAL_HOST],
            'Strict-Transport-Security',
            'max-age=31536000; includeSubDomains; preload',
          ),
        ]
      : []),
    header('frame', hosts, 'X-Frame-Options', 'SAMEORIGIN'),
    // One rule sets one header: the sandbox pair is two rules. Both sit with the header rules, ahead of
    // every origin and redirect rule (the `/catalog/` legacy redirect), so no later rule shadows them.
    ...(preview
      ? []
      : [
          sandbox('catalog-sandbox', 'Content-Security-Policy', 'sandbox'),
          sandbox('catalog-nosniff', 'X-Content-Type-Options', 'nosniff'),
        ]),
  ];
  const origins = preview
    ? []
    : [...legacy.entries.map((e) => legacyRule(e, hosts)), ...repoRules(legacy.entries, claims, hosts)].sort(
        (a, b) => b.order - a.order,
      );
  const rules = [...headers, ...origins.map((o) => o.rule)];
  const problems = problemsOf(rules, origins, { hosts, prod });
  if (problems.length > 0) throw new PlanError(problems);
  return rules;
}

const EXIT = { ok: 0, refused: 1, usage: 2 };

/**
 * @param {string[]} argv
 * @returns {{ code: number, stdout: string, stderr: string }}
 */
function run(argv) {
  /** @type {PlanInput} */
  const input = {};
  let zone;
  try {
    const { values } = parseArgs({ args: argv, options: { zone: { type: 'string' }, legacy: { type: 'string' } } });
    zone = values.zone ?? '';
    zoneSpec(zone);
    if (values.legacy !== undefined) {
      const doc = /** @type {unknown} */ (JSON.parse(readFileSync(values.legacy, 'utf8')));
      if (typeof doc !== 'object' || doc === null || !('entries' in doc) || !Array.isArray(doc.entries))
        throw new Error(`${values.legacy} has no entries array`);
      input.legacy = /** @type {{ entries: LegacyEntry[] }} */ (doc);
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      code: EXIT.usage,
      stdout: '',
      stderr: `${reason}\nusage: rules.mjs --zone <dev|prod|preview:<slug>> [--legacy <file>]\n`,
    };
  }
  try {
    const { pull, hosts } = zoneSpec(zone);
    const plan = { zone, pullZone: pull, hosts, rules: planRules(zone, input) };
    return { code: EXIT.ok, stdout: `${JSON.stringify(plan, null, 2)}\n`, stderr: '' };
  } catch (err) {
    if (!(err instanceof PlanError)) throw err;
    return { code: EXIT.refused, stdout: '', stderr: `${err.problems.join('\n')}\n` };
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { code, stdout, stderr } = run(process.argv.slice(2));
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  process.exitCode = code;
}
