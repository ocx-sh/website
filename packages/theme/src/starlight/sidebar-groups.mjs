// Sidebar groups that load after the page (Sidebar.astro stubs them, frag-sidebar.astro serves them).
// Both sides key a group by the hash of its labels and hrefs, so a page defers only a group the injected
// fragment route also serves: a route middleware that rewrites the sidebar renders those groups inline.

/** @typedef {import('@astrojs/starlight/route-data').StarlightRouteData['sidebar'][number]} Entry */
/** @typedef {Extract<Entry, { type: 'group' }>} Group */

/**
 * @param {Entry[]} list
 * @returns {string}
 */
const identity = (list) =>
  list.map((e) => (e.type === 'group' ? e.label + `[${identity(e.entries)}]` : e.label + e.href)).join('\n');

/**
 * 32-bit string hash in base 36 (Starlight's sidebar hash, before padding).
 * @param {string} id
 * @returns {string}
 */
export function hash32(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h << 5) - h + id.charCodeAt(i);
  return (h >>> 0).toString(36);
}

/**
 * Short stable key of a group: its content, not its place or the current page.
 * @param {Group} g
 * @returns {string}
 */
export const groupKey = (g) => hash32(identity([g]));

/**
 * Every nested (below the top level) collapsed group of a sidebar, by key.
 * @param {Entry[]} sidebar
 * @returns {Map<string, Group>}
 */
export function deferrable(sidebar) {
  /** @type {Map<string, Group>} */
  const out = new Map();
  /** @param {Entry[]} list @param {number} depth */
  const walk = (list, depth) => {
    for (const e of list)
      if (e.type === 'group') {
        if (depth > 0 && e.collapsed) {
          const key = groupKey(e);
          const other = out.get(key);
          // A 32-bit key can collide; one fragment would then serve the wrong links.
          if (other && identity([other]) !== identity([e]))
            throw new Error(
              `Sidebar groups "${other.label}" and "${e.label}" share the deferral key ${key}; rename one.`,
            );
          out.set(key, e);
        }
        walk(e.entries, depth + 1);
      }
  };
  walk(sidebar, 0);
  return out;
}

/** @type {Map<string, Group> | undefined} */
let known;
/**
 * The groups the fragment route serves, built once from the configured sidebar.
 * @param {() => Entry[]} configured
 * @returns {Map<string, Group>}
 */
export const servedGroups = (configured) => (known ??= deferrable(configured()));
