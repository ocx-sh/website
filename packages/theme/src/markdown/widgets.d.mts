/**
 * Raw HTML as a node: an `html` node in Markdown, a `Fragment set:html` in MDX, where raw HTML
 * would be parsed as JSX.
 * @param {string} html
 * @param {Ctx} ctx
 * @param {'flow' | 'text'} [kind] block or inline position, MDX only
 * @returns {Phrasing}
 */
export function raw(html: string, ctx: Ctx, kind?: "flow" | "text"): Phrasing;
/**
 * The Sätteri mdast plugin. It must run before Starlight's asides plugin, which renders the
 * `containerDirective`s it produces, and before Starlight's directive restoration.
 * @type {import('satteri').MdastPluginDefinition}
 */
export const widgets: import("satteri").MdastPluginDefinition;
/**
 * Sätteri hast plugin: a task-list checkbox is named by its item's text (an unlabelled form field fails
 * Lighthouse accessibility). The box sits in the item, or in its first paragraph when the item is loose.
 * @type {import('satteri').HastPluginDefinition}
 */
export const taskLabels: import("satteri").HastPluginDefinition;
export type Ctx = import("satteri").MdastVisitorContext;
export type Node = import("satteri").MdastNode;
export type Custom = import("satteri").Custom;
export type Phrasing = import("mdast").PhrasingContent;
export type HastChild = import("satteri").HastNode;
