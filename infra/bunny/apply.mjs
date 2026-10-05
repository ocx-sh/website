// `task bunny:apply -- --zone <z> [--dry-run]`: makes a pull zone's `ocx:*` edge rules equal the plan without ever
// leaving a routed path unrouted: upsert, then delete only stale `ocx:*` rules, then read back.
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { EXIT, RefusalError, createClient, findByName } from './api.mjs';
import { TRIGGER, planRules } from './rules.mjs';
import { zoneSpec } from './zones.mjs';

/** Bunny allows 50 edge rules per pull zone. */
export const RULE_LIMIT = 50;
const OWN_PREFIX = 'ocx:';
// ponytail: the compared field names and the two normalisations in `covers` and `diff` (a null `ActionParameter2`
// reads as '', an absent `OrderIndex` as the rule's position) are the documented API shape, not a recorded one.
// Re-check against the owner's recorded edge-rule responses (infra/bunny/README.md, "Record a response") before
// the first apply, or a real zone reads back as "differs" forever. Ceiling: the four passes order by pattern
// only, so two rules that swap patterns with each other cannot be applied without a gap.
/** The planned rule fields compared against the live zone; the live rule may carry more. */
const FIELDS = [
  'ActionType',
  'ActionParameter1',
  'ActionParameter2',
  'TriggerMatchingType',
  'Enabled',
  'Triggers',
  'OrderIndex',
];

/** @typedef {import('./rules.mjs').BunnyRule & { OrderIndex: number }} PlannedRule */
/** @typedef {{ Guid: string, Description?: string } & Record<string, unknown>} LiveRule */
/**
 * @typedef {object} Diff
 * @property {PlannedRule[]} create planned rules with no live counterpart
 * @property {{ want: PlannedRule, got: LiveRule, field: string }[]} update live counterparts that differ
 * @property {LiveRule[]} stale live `ocx:*` rules the plan no longer names, and duplicates of a planned name
 */

/**
 * @typedef {object} MainOptions
 * @property {string[]} argv
 * @property {Record<string, string | undefined>} env
 * @property {(text: string) => void} out the result
 * @property {(text: string) => void} err messages about the run
 * @property {typeof globalThis.fetch} [fetch] injected in tests
 * @property {string} [baseUrl] API origin, injected in tests
 * @property {{ entries: import('./rules.mjs').LegacyEntry[] }} [legacy] replaces the committed `legacy.json`
 */

/**
 * True when every field of `want` is present and equal in `got`; objects and arrays are walked, extra
 * fields of `got` are ignored.
 * @param {unknown} want
 * @param {unknown} got
 * @returns {boolean}
 */
function covers(want, got) {
  if (Array.isArray(want))
    return Array.isArray(got) && want.length === got.length && want.every((w, i) => covers(w, got[i]));
  if (want !== null && typeof want === 'object') {
    const g = /** @type {Record<string, unknown>} */ (got);
    return got !== null && typeof got === 'object' && Object.entries(want).every(([k, v]) => covers(v, g[k]));
  }
  return want === got || (want === '' && (got === null || got === undefined));
}

/** @param {Record<string, unknown>} r @returns {string[]} the URL patterns a rule matches */
const urlPatterns = (r) =>
  /** @type {import('./rules.mjs').Trigger[]} */ (Array.isArray(r.Triggers) ? r.Triggers : []).flatMap((t) =>
    t.Type === TRIGGER.Url ? t.PatternMatches : [],
  );

/**
 * True when applying `want` over `got` stops the rule matching a URL it matches now: a dropped pattern, or a
 * rule switched off. Such an update must wait until the rules taking over those paths are live.
 * @param {PlannedRule} want
 * @param {LiveRule} got
 * @returns {boolean}
 */
function narrows(want, got) {
  const kept = new Set(urlPatterns(want));
  return (got.Enabled !== false && want.Enabled === false) || urlPatterns(got).some((p) => !kept.has(p));
}

/** @param {LiveRule} r */
const isOwn = (r) => r.Description?.startsWith(OWN_PREFIX) === true;

/**
 * @param {PlannedRule[]} plan
 * @param {LiveRule[]} rules the zone's live rules
 * @returns {Diff}
 */
function diff(plan, rules) {
  const live = rules.map((r, i) => ({ ...r, OrderIndex: r.OrderIndex ?? i }));
  const names = new Set(plan.map((r) => r.Description));
  /** @type {Map<string, LiveRule>} */
  const byName = new Map();
  /** @type {LiveRule[]} */
  const stale = [];
  for (const r of live.filter(isOwn)) {
    const name = String(r.Description);
    if (names.has(name) && !byName.has(name)) byName.set(name, r);
    else stale.push(r);
  }
  /** @type {Diff} */
  const out = { create: [], update: [], stale };
  for (const want of plan) {
    const got = byName.get(want.Description);
    if (!got) out.create.push(want);
    else {
      const field = FIELDS.find((f) => !covers(/** @type {Record<string, unknown>} */ (want)[f], got[f]));
      if (field) out.update.push({ want, got, field });
    }
  }
  return out;
}

/**
 * @param {Diff} d
 * @returns {string | null} the first difference, or null when live equals the plan
 */
function firstDifference({ create, update, stale }) {
  const u = update[0];
  if (u) {
    const [want, got] = [/** @type {Record<string, unknown>} */ (u.want)[u.field], u.got[u.field]];
    return u.field === 'OrderIndex'
      ? `${u.want.Description}: order is ${String(got)}, planned ${String(want)}`
      : `${u.want.Description}: field ${u.field} is ${JSON.stringify(got)}, planned ${JSON.stringify(want)}`;
  }
  if (create[0]) return `${create[0].Description}: missing from the zone`;
  if (stale[0]) return `${stale[0].Description}: still live although the plan no longer names it`;
  return null;
}

/**
 * Live rules of a pull zone GET; refuses a body that is not a pull zone with an edge-rule array.
 * @param {unknown} zone
 * @returns {{ Id: number, EdgeRules: LiveRule[] }}
 */
function asZone(zone) {
  const z = /** @type {{ Id?: unknown, EdgeRules?: unknown } | null} */ (zone);
  if (typeof z?.Id !== 'number' || !Array.isArray(z.EdgeRules))
    throw new Error('pull zone response has no Id and EdgeRules');
  /** @type {unknown[]} */
  const rules = z.EdgeRules;
  return { Id: z.Id, EdgeRules: rules.map((r) => /** @type {LiveRule} */ (r)) };
}

/**
 * @param {import('./api.mjs').BunnyClient} client
 * @param {string} name pull zone name
 * @returns {Promise<{ Id: number, EdgeRules: LiveRule[] } | undefined>}
 */
async function findZone(client, name) {
  const found = findByName(await client.get('/pullzone'), name);
  return found ? asZone(await client.get(`/pullzone/${String(found.Id)}`)) : undefined;
}

/**
 * Applies a zone's plan. Exit 0 on success, 1 on a refusal (CI, empty key, unknown zone, over the rule
 * limit, API failure, read-back difference), 2 on bad arguments. Nothing is written before the limit check.
 * @param {MainOptions} options
 * @returns {Promise<number>}
 */
export async function main({ argv, env, out, err, fetch, baseUrl, legacy }) {
  /** @type {string} */
  let zone;
  /** @type {boolean} */
  let dryRun;
  try {
    const { values } = parseArgs({ args: argv, options: { zone: { type: 'string' }, 'dry-run': { type: 'boolean' } } });
    zone = values.zone ?? '';
    dryRun = values['dry-run'] === true;
    zoneSpec(zone);
  } catch (e) {
    err(
      `${e instanceof Error ? e.message : String(e)}\nusage: apply.mjs --zone <dev|prod|preview:<slug>> [--dry-run]\n`,
    );
    return EXIT.usage;
  }

  try {
    const { pull } = zoneSpec(zone);
    const plan = planRules(zone, legacy ? { legacy } : {}).map((r, OrderIndex) => ({ ...r, OrderIndex }));
    const client = createClient(env, { ...(fetch ? { fetch } : {}), ...(baseUrl ? { baseUrl } : {}) });
    const live = await findZone(client, pull);
    if (!live) throw new RefusalError(`no pull zone named ${pull}`);

    const d = diff(plan, live.EdgeRules);
    const total = live.EdgeRules.length + d.create.length;
    if (total > RULE_LIMIT)
      throw new RefusalError(
        `${live.EdgeRules.length} live rules and ${d.create.length} new planned rules would coexist as ${total}, over the limit of ${RULE_LIMIT}; no write sent`,
      );

    const lines = [
      ...d.create.map((r) => `create ${r.Description}`),
      ...d.update.map((u) => `update ${u.want.Description} (${u.field})`),
      ...d.stale.map((r) => `delete ${r.Description}`),
    ];
    if (dryRun) {
      out(`${pull}: ${lines.length === 0 ? 'no changes' : `\n${lines.join('\n')}`}\n`);
      return EXIT.ok;
    }

    // Four passes keep every routed path routed: creates, updates that keep or widen their patterns, updates that
    // narrow (a path moving from one existing rule to another is already claimed by the widened one), deletes last.
    const path = `/pullzone/${live.Id}/edgerules`;
    const upsert = (/** @type {PlannedRule} */ want, /** @type {LiveRule | undefined} */ got) =>
      client.post(`${path}/addOrUpdate`, got ? { ...want, Guid: got.Guid } : want);
    for (const want of d.create) await upsert(want, undefined);
    for (const u of d.update.filter((x) => !narrows(x.want, x.got))) await upsert(u.want, u.got);
    for (const u of d.update.filter((x) => narrows(x.want, x.got))) await upsert(u.want, u.got);
    for (const r of d.stale) await client.delete(`${path}/${r.Guid}`);

    const back = firstDifference(diff(plan, asZone(await client.get(`/pullzone/${live.Id}`)).EdgeRules));
    if (back) throw new RefusalError(`read-back differs: ${back}`);
    out(`${pull}: ${plan.length} rules, ${lines.length} changes applied, read back equal\n`);
    return EXIT.ok;
  } catch (e) {
    err(`${e instanceof Error ? e.message : String(e)}\n`);
    return EXIT.refused;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await main({
    argv: process.argv.slice(2),
    env: process.env,
    out: (t) => process.stdout.write(t),
    err: (t) => process.stderr.write(t),
  });
}
