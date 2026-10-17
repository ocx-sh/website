export { ICON_SOURCES } from "./icons.sources.generated.mjs";
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
export const ICONS: Record<IconName, IconDef>;
/** Registry names in catalog order. @type {IconName[]} */
export const ICON_NAMES: IconName[];
export type IconGroup = "interface" | "action" | "brand" | "os" | "shell";
export type IconDef = {
    viewBox: string;
    /**
     * SVG children, inserted verbatim; no colour of their own (currentColor).
     */
    body: string;
    /**
     * Line icon: stroke width in viewBox units (`--ocx-icon-stroke` overrides it). Absent: filled.
     */
    stroke?: number;
    group: IconGroup;
    /**
     * Extra words the catalog search matches.
     */
    keywords: string;
};
export type IconName = keyof typeof GENERATED;
import { ICONS as GENERATED } from './icons.generated.mjs';
