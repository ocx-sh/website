/**
 * @typedef {{ cratesIo?: string, docsRs?: string, repository?: string, website?: string }} ComponentLinks
 * @typedef {{ name: string, version: string, license: string, description: string, author: string,
 *   scope: string, links: ComponentLinks }} DependencyComponent
 * @typedef {{ total: number, required: number, excluded: number, uniqueLicenses: number,
 *   licenses: Record<string, number> }} BinarySummary
 * @typedef {{ version: string, license: string, target: string, summary: BinarySummary,
 *   components: DependencyComponent[] }} BinaryData
 * @typedef {{ generated: string, binaries: Record<string, BinaryData> }} DependencyData
 */
/**
 * Row identity: `name@version` (two versions of one crate are two rows).
 * @param {DependencyComponent} c
 * @returns {string}
 */
export function componentKey(c: DependencyComponent): string;
/**
 * The first binary in the file (the page shows one binary, as the Vue original did).
 * @param {DependencyData} data
 * @returns {BinaryData | null}
 */
export function firstBinary(data: DependencyData): BinaryData | null;
/**
 * Licence `<select>` options, most-used first.
 * @param {Record<string, number>} licenses
 * @returns {[string, number][]}
 */
export function licenseOptions(licenses: Record<string, number>): [string, number][];
/**
 * Case-insensitive substring search over name + description, AND an exact
 * licence match (empty query / licence = no constraint).
 * @param {DependencyComponent[]} components
 * @param {string} query
 * @param {string} license
 * @returns {DependencyComponent[]}
 */
export function filterComponents(components: DependencyComponent[], query: string, license: string): DependencyComponent[];
/**
 * Whether the row expands: it has a description or an author.
 * @param {DependencyComponent} c
 * @returns {boolean}
 */
export function hasDetail(c: DependencyComponent): boolean;
/**
 * The URL if it is absolute http(s), else null (no `javascript:`, `data:`, relative).
 * @param {string | undefined} url
 * @returns {string | null}
 */
export function safeHref(url: string | undefined): string | null;
/**
 * Placeholder rows for the loading state (C-221): the rows the SBOM will render, capped at
 * `RESERVE_MAX`. Only a `data:` source is readable at build time; any other source reserves the cap.
 * ponytail: a same-site file under `public/` could be read at build time too; add it when a consumer
 * ships an SBOM shorter than the cap.
 * @param {string} src
 * @returns {Promise<number>}
 */
export function reserveRows(src: string): Promise<number>;
/**
 * The attributes Zag `collapsible` renders for a closed row with this id (what `ssrApi` gives; a
 * unit test holds them equal), so a runtime row paints final before its machine loads (C-130a).
 * @param {string} id
 * @returns {Record<'root' | 'trigger' | 'content', Record<string, string>>}
 */
export function collapsibleParts(id: string): Record<"root" | "trigger" | "content", Record<string, string>>;
/**
 * Wires the explorer in `root` once and loads it: from `root.dataset.src` on mount, again on
 * `ocx:deps:load` (C-222), whose optional `detail.data` is the dependency JSON or a promise of it.
 * @param {HTMLElement} root
 * @returns {Promise<void>} the first load
 */
export function mountExplorer(root: HTMLElement): Promise<void>;
/** Most placeholder rows the loading state reserves (C-221). */
export const RESERVE_MAX: 12;
export type ComponentLinks = {
    cratesIo?: string;
    docsRs?: string;
    repository?: string;
    website?: string;
};
export type DependencyComponent = {
    name: string;
    version: string;
    license: string;
    description: string;
    author: string;
    scope: string;
    links: ComponentLinks;
};
export type BinarySummary = {
    total: number;
    required: number;
    excluded: number;
    uniqueLicenses: number;
    licenses: Record<string, number>;
};
export type BinaryData = {
    version: string;
    license: string;
    target: string;
    summary: BinarySummary;
    components: DependencyComponent[];
};
export type DependencyData = {
    generated: string;
    binaries: Record<string, BinaryData>;
};
