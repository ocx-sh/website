// Pagefind's UI stops at the first merged bundle that fails to load (`mergeIndex` awaits each
// `init`), so a section still on a legacy origin (infra/bunny/legacy.json) would kill the whole
// search. This Starlight plugin runs after `ocxTheme()` and drops those sections' bundles.
import { readFileSync } from 'node:fs';

/** @typedef {{ bundlePath: string }} MergeEntry */
/** @typedef {{ entries: { paths: string[] }[] }} Legacy */

/**
 * `legacy.json` is the one record of hosting state: a deleted entry re-enables its section's search.
 * @param {Legacy} legacy
 * @param {MergeEntry[]} mergeIndex
 * @returns {MergeEntry[]} the entries whose claim (the bundle's directory) no legacy path covers
 */
export function liveMergeIndex(legacy, mergeIndex) {
  const dir = (/** @type {string} */ p) => p.replace(/\/?$/, '/'); // `/integrations/bazel` and `/integrations/bazel/` are one claim
  const paths = legacy.entries.flatMap((e) => e.paths.map(dir));
  return mergeIndex.filter((m) => {
    const claim = dir(m.bundlePath.replace(/pagefind\/?$/, ''));
    return !paths.some((p) => claim.startsWith(p));
  });
}

/** @param {URL} legacyFile */
export function withoutLegacyBundles(legacyFile) {
  return {
    name: 'ocx-site-legacy-search',
    hooks: {
      /** @param {{ config: { pagefind?: unknown }, updateConfig: (c: object) => void }} ctx */
      'config:setup': ({ config, updateConfig }) => {
        const pagefind = /** @type {{ mergeIndex?: MergeEntry[] } | undefined} */ (
          typeof config.pagefind === 'object' ? config.pagefind : undefined
        );
        const doc = /** @type {unknown} */ (JSON.parse(readFileSync(legacyFile, 'utf8')));
        const legacy = /** @type {Legacy} */ (doc);
        updateConfig({ pagefind: { ...pagefind, mergeIndex: liveMergeIndex(legacy, pagefind?.mergeIndex ?? []) } });
      },
    },
  };
}
