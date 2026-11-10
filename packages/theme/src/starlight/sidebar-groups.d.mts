/**
 * 32-bit string hash in base 36 (Starlight's sidebar hash, before padding).
 * @param {string} id
 * @returns {string}
 */
export function hash32(id: string): string;
/**
 * Every nested (below the top level) collapsed group of a sidebar, by key.
 * @param {Entry[]} sidebar
 * @returns {Map<string, Group>}
 */
export function deferrable(sidebar: Entry[]): Map<string, Group>;
export function groupKey(g: Group): string;
export function servedGroups(configured: () => Entry[]): Map<string, Group>;
export type Entry = import("@astrojs/starlight/route-data").StarlightRouteData["sidebar"][number];
export type Group = Extract<Entry, {
    type: "group";
}>;
