/**
 * Sätteri hast plugin: a heading with an id and no link of its own becomes its own permalink. A heading that holds a
 * link keeps no permalink (its id still works from the table of contents and by hand). Runs after the heading ids exist.
 * @type {import('satteri').HastPluginDefinition}
 */
export const headingAnchors: import("satteri").HastPluginDefinition;
