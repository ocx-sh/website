// Bunny zone names, host sets and storage regions (.agents/adr/adr_0002_phase2-bunny-cutover.md#d62-zone-topology-dev-prod-previews). Pure data, no I/O.

import { zoneName } from '../../packages/theme/src/registry.mjs';
import { SITES, previewZone, slug } from '../../scripts/previews/sites.mjs';

/** The public apex; the only host without `noindex`. */
export const PUBLIC_HOST = 'ocx.sh';

/**
 * The cutover rehearsal host: a DNS-only CNAME straight to the prod pull zone, so it must carry every rule
 * `ocx.sh` does, and `noindex` on top (a public rehearsal host must never be indexed).
 */
export const REHEARSAL_HOST = 'next.ocx.sh';

/**
 * Storage-zone regions, one constant for every zone `bunny:onboard` creates. Primary is Bunny's default
 * (Falkenstein, DE). Replication is none: the owner's `sh-ocx-website` zone is DE-only, and a
 * replication region cannot be removed once added.
 */
export const REGION = { primary: 'DE', replication: /** @type {string[]} */ ([]) };

/** The repo whose site is the pull zone's default origin: it needs no `OriginStorage` rule. */
export const ROOT_REPO = 'ocx-sh/website';

/** The Bunny storage zone of `repo` (`ocx-sh/rules_ocx` is `sh-ocx-rules-ocx`): one source, the theme registry the deploy action uses. */
export const storageZoneName = zoneName;

const ROOT_STORAGE = storageZoneName(ROOT_REPO);

/**
 * @typedef {object} ZoneSpec
 * @property {string} pull the pull-zone name
 * @property {string} storage the storage zone the pull zone's default origin points at
 * @property {string[]} hosts the zone's literal hosts, `b-cdn.net` last
 */

/**
 * @param {string} zone `dev`, `prod` or `preview:<slug>`
 * @returns {ZoneSpec}
 */
export function zoneSpec(zone) {
  if (zone === 'dev') return { pull: 'sh-ocx-dev', storage: ROOT_STORAGE, hosts: ['sh-ocx-dev.b-cdn.net'] };
  if (zone === 'prod')
    return { pull: 'sh-ocx', storage: ROOT_STORAGE, hosts: [PUBLIC_HOST, REHEARSAL_HOST, 'sh-ocx.b-cdn.net'] };
  const given = zone.startsWith('preview:') ? zone.slice('preview:'.length) : '';
  const site = SITES.find((s) => slug(s) === given);
  if (!site)
    throw new Error(
      `unknown zone "${zone}": expected dev, prod or preview:<slug>, slug one of ${SITES.map(slug).join(', ')}`,
    );
  const name = previewZone(site);
  return { pull: name, storage: name, hosts: [`${name}.b-cdn.net`] };
}

/**
 * Number of path segments of a claim path: `/integrations/bazel/` is 2, `/catalog.html` is 1.
 * @param {string} path
 * @returns {number}
 */
export function claimDepth(path) {
  return path.split('/').filter(Boolean).length;
}

/**
 * The Bunny redirect target of a legacy `redirect` entry: `<origin>%{Path.N-}`, N = claim depth,
 * so `<claim>a/b/` lands on `<origin>a/b/`.
 * @param {{ id: string, mode: string, origin: string, paths: string[] }} entry
 * @returns {string}
 */
export function redirectTemplate(entry) {
  if (entry.mode !== 'redirect') throw new Error(`legacy entry ${entry.id} is not a redirect entry`);
  return `${entry.origin}%{Path.${claimDepth(entry.paths[0] ?? '')}-}`;
}
