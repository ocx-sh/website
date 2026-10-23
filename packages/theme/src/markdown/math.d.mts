/**
 * Sätteri mdast plugin: ```` ```math ```` fences always; `$…$` and `$$…$$` only reach it when the
 * processor's `math` feature parses them.
 * @type {import('satteri').MdastPluginDefinition}
 */
export const math: import("satteri").MdastPluginDefinition;
