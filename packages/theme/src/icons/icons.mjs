// Icon registry: every icon the theme draws, by name. `ui/Icon.astro` renders one inline (no
// request, no flicker); the showcase catalog lists them all. The data is icons.generated.mjs, written
// by scripts/generate-icons.mjs: UI icons from Lucide (24px grid, stroked in currentColor at the
// `--ocx-icon-stroke` weight), OS, brand and shell glyphs from Simple Icons (filled in currentColor),
// and a few custom ones (Tux, Elvish, cmd, sort). Sources and licences in icons/README.md.
import { ICONS as GENERATED } from './icons.generated.mjs';

// Catalog-only data in its own module, so bundles that import just ICONS tree-shake it.
export { ICON_SOURCES } from './icons.sources.generated.mjs';

/**
 * @typedef {'interface' | 'action' | 'brand' | 'os' | 'shell'} IconGroup
 * @typedef {object} IconDef
 * @property {string} viewBox
 * @property {string} body SVG children, inserted verbatim; no colour of their own (currentColor).
 * @property {number} [stroke] Line icon: stroke width in viewBox units (`--ocx-icon-stroke` overrides it). Absent: filled.
 * @property {IconGroup} group
 * @property {string} keywords Extra words the catalog search matches.
 */

/** @typedef {keyof typeof GENERATED} IconName */

/** @type {Record<IconName, IconDef>} */
export const ICONS = GENERATED;

/** Registry names in catalog order. @type {IconName[]} */
export const ICON_NAMES = /** @type {IconName[]} */ (Object.keys(ICONS));
