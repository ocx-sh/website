// Static analysis of the showcase (C-121) and the consumer fixture (C-124): reads component
// `.astro` sources and example `.mdx` pages as text, never builds. Pure functions, so
// showcase-shape.test.ts and scripts/pack-smoke.mjs share one reading of the pages.
import ts from 'typescript';
import { posix } from 'node:path';

/** @param {string} source */
const frontmatter = (source) => /^---\r?\n([\s\S]*?)\r?\n---/.exec(source)?.[1] ?? '';
/** @param {string} source */
const template = (source) => source.replace(/^---\r?\n[\s\S]*?\r?\n---/, '');
/** The template without `<script>`/`<style>` blocks: a selector string in a script is no markup. @param {string} source */
const markup = (source) => template(source).replace(/<(script|style)\b[\s\S]*?<\/\1>/g, '');
/** Page source with fenced code blocks blanked, so examples in fences never count. @param {string} mdx */
export const stripFences = (mdx) => mdx.replace(/^([ \t]*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\2[ \t]*$/gm, '');

/** @param {ts.PropertyName} name @param {ts.SourceFile} sf */
const keyOf = (name, sf) =>
  ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name) ? name.text : name.getText(sf);

/**
 * Declared `Props` members of an `.astro` component, read with the TypeScript compiler API from
 * its frontmatter: `interface Props` (incl. `extends`) or `type Props =` (unions, intersections,
 * local type references, `Omit`). HTML attribute passthrough (`HTMLAttributes<'x'>`) adds one
 * `rest → <x>` row (`rest → <button> | <a>` for several elements). No `Props` → no rows.
 * @param {string} source
 * @returns {string[]}
 */
export function extractProps(source) {
  const sf = ts.createSourceFile('Props.ts', frontmatter(source), ts.ScriptTarget.Latest, true);
  /** @type {Map<string, ts.InterfaceDeclaration | ts.TypeAliasDeclaration>} */
  const decls = new Map();
  for (const s of sf.statements)
    if (ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s)) decls.set(s.name.text, s);
  const props = decls.get('Props');
  if (!props) return [];

  /** @type {string[]} */ const elements = [];
  /** @param {string} name @param {readonly ts.TypeNode[]} args @returns {string[]} */
  const ref = (name, args) => {
    const [first, second] = args;
    if (name === 'HTMLAttributes') {
      if (!first || !ts.isLiteralTypeNode(first) || !ts.isStringLiteral(first.literal))
        throw new Error('Props: HTMLAttributes needs a string literal element');
      const el = `<${first.literal.text}>`;
      if (!elements.includes(el)) elements.push(el);
      return [];
    }
    if (name === 'Omit' && first) {
      const drop = second ? literals(second) : [];
      return members(first).filter((m) => !drop.includes(m));
    }
    if (['Partial', 'Required', 'Readonly'].includes(name) && first) return members(first);
    const local = decls.get(name);
    if (!local) throw new Error(`Props: cannot read type \`${name}\` (not a local declaration); add its members`);
    return ts.isInterfaceDeclaration(local) ? iface(local) : members(local.type);
  };
  /** @param {ts.TypeNode} node @returns {string[]} */
  const literals = (node) =>
    ts.isUnionTypeNode(node)
      ? node.types.flatMap(literals)
      : ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal)
        ? [node.literal.text]
        : [];
  /** @param {ts.NodeArray<ts.TypeElement>} list */
  const own = (list) => list.flatMap((m) => (m.name && !ts.isComputedPropertyName(m.name) ? [keyOf(m.name, sf)] : []));
  /** @param {ts.InterfaceDeclaration} d @returns {string[]} */
  const iface = (d) => [
    ...own(d.members),
    ...(d.heritageClauses ?? []).flatMap((h) =>
      h.types.flatMap((t) => {
        if (!ts.isIdentifier(t.expression)) throw new Error(`Props: cannot read \`extends ${t.getText(sf)}\``);
        return ref(t.expression.text, t.typeArguments ?? []);
      }),
    ),
  ];
  /** @param {ts.TypeNode} node @returns {string[]} */
  const members = (node) => {
    if (ts.isTypeLiteralNode(node)) return own(node.members);
    if (ts.isUnionTypeNode(node) || ts.isIntersectionTypeNode(node)) return node.types.flatMap(members);
    if (ts.isParenthesizedTypeNode(node)) return members(node.type);
    if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName))
      return ref(node.typeName.text, node.typeArguments ?? []);
    throw new Error(`Props: cannot read type \`${node.getText(sf)}\``);
  };

  const names = [...new Set(ts.isInterfaceDeclaration(props) ? iface(props) : members(props.type))];
  return elements.length ? [...names, `rest → ${elements.join(' | ')}`] : names;
}

/**
 * Theme components a page imports: local name → specifier under `@ocx-sh/theme/components/`.
 * @param {string} mdx
 * @returns {Map<string, string>}
 */
export function pageImports(mdx) {
  /** @type {Map<string, string>} */ const out = new Map();
  for (const m of stripFences(mdx).matchAll(
    /^import\s+(\w+)\s+from\s+['"]@ocx-sh\/theme\/components\/([^'"]+\.astro)['"]/gm,
  ))
    out.set(m[1] ?? '', m[2] ?? '');
  return out;
}

/** github-slugger's rule for the ASCII headings we write. @param {string} text */
const slug = (text) =>
  text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');

/**
 * Slug ids of the page's `##`…`######` headings (outside code fences).
 * @param {string} mdx
 * @returns {string[]}
 */
export function headingIds(mdx) {
  return [...stripFences(mdx).matchAll(/^#{2,6}\s+(.+?)\s*$/gm)].map((m) => slug(m[1] ?? ''));
}

/**
 * The balanced `{…}` expression starting at `open` (a `{`), skipping braces inside strings.
 * @param {string} s @param {number} open
 */
function braced(s, open) {
  return s.slice(open + 1, closing(s, open));
}

/**
 * Index of the `}` that closes the `{` at `open`, skipping braces inside strings.
 * @param {string} s @param {number} open
 */
function closing(s, open) {
  let depth = 0;
  /** @type {string | undefined} */ let quote;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = undefined;
    } else if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  throw new Error(`unbalanced braces after offset ${open}`);
}

/**
 * Every `<PropsTable of="…" rows={[…]} />` on the page, with the `name` of each row. `rows` must
 * be an inline array literal (anything else reads as no rows, which the shape check reports).
 * @param {string} mdx
 * @returns {{ of: string, names: string[] }[]}
 */
export function propsTables(mdx) {
  const src = stripFences(mdx);
  return [...src.matchAll(/<PropsTable\b/g)].map((m) => {
    // The tag runs to its first `/>` or `>` outside a `{…}` attribute value.
    let end = m.index;
    while (end < src.length && src[end] !== '>') end = src[end] === '{' ? closing(src, end) + 1 : end + 1;
    const tag = src.slice(m.index, end + 1);
    const rowsAt = tag.indexOf('rows={');
    const expr = rowsAt < 0 ? '[]' : braced(tag, rowsAt + 'rows='.length);
    const of = /\bof="([^"]+)"/.exec(tag.replace(/\{[\s\S]*\}/, ''))?.[1] ?? '';
    const sf = ts.createSourceFile('rows.ts', `(${expr})`, ts.ScriptTarget.Latest, true);
    /** @type {string[]} */ const names = [];
    const first = sf.statements[0];
    let node = first && ts.isExpressionStatement(first) ? first.expression : undefined;
    while (node && ts.isParenthesizedExpression(node)) node = node.expression;
    if (node && ts.isArrayLiteralExpression(node))
      for (const el of node.elements)
        if (ts.isObjectLiteralExpression(el))
          for (const p of el.properties)
            if (
              ts.isPropertyAssignment(p) &&
              keyOf(p.name, sf) === 'name' &&
              (ts.isStringLiteral(p.initializer) || ts.isNoSubstitutionTemplateLiteral(p.initializer))
            )
              names.push(p.initializer.text);
    return { of, names };
  });
}

/**
 * Is the component Zag-backed: its markup carries `data-zag-root`, or a module its script imports
 * mounts roots at runtime (`mount(`, e.g. the DependencyExplorer's rows)?
 * @param {string} source
 * @param {(relative: string) => string | undefined} [module] source of a module the component
 *   imports by relative specifier (`./x.mjs`), if known
 * @returns {boolean}
 */
export function isZagBacked(source, module = () => undefined) {
  if (/data-zag-root/.test(markup(source))) return true;
  for (const [, spec] of source.matchAll(/(?:from\s*|import\(\s*)['"](\.\.?\/[^'"]+\.mjs)['"]/g))
    if (spec && /\bmount\(/.test(module(spec) ?? '')) return true;
  return false;
}

/**
 * The root class a rendered instance carries (first `ocx-` class in the template), if any.
 * @param {string} source
 * @returns {string | undefined}
 */
export function rootClass(source) {
  return /\bclass(?::list)?=[{'"[\s]*['"]?(ocx-[\w-]+)/.exec(template(source))?.[1];
}

/**
 * Does the component open a popup (Popover API, dialog, listbox or menu)?
 * @param {string} source
 */
export const isOverlay = (source) => /\spopover[\s=>]|role="(dialog|listbox|menu)"/.test(template(source));

/** @param {readonly string[]} a @param {readonly string[]} b */
const minus = (a, b) => a.filter((x) => !b.includes(x));

/**
 * C-121: every exported component outside `exempt` has one page, the page holding its
 * `<PropsTable of="…">` and importing it (itself or through one of its stories); each PropsTable's
 * rows equal the component's declared Props. The page (C-125) has headings `stories`, `props`
 * (+ `events`, `keyboard` when it documents a Zag-backed component), `<Stories of="<slug>"`
 * naming its own slug, and imports no theme component it does not render. Overlays are never
 * rendered open, on the page or in its stories. A page may import other components for composition.
 * @param {{ components: Record<string, string>, pages: Record<string, string>, exempt: readonly string[], staticOpen?: readonly string[], modules?: Record<string, string>, stories?: Record<string, readonly string[]> }} input
 *   components: specifier → `.astro` source; pages: slug → `.mdx` source; staticOpen: overlays still
 *   allowed to show a static open state; modules: path (as components') → `.mjs` source;
 *   stories: slug → the `.mdx` sources of `src/stories/<slug>/`
 * @returns {string[]} problems; empty means the showcase has the contract shape
 */
export function checkShape({ components, pages, exempt, staticOpen = [], modules = {}, stories = {} }) {
  /** @param {string} spec @returns {(relative: string) => string | undefined} */
  const near = (spec) => (relative) => modules[posix.join(posix.dirname(spec), relative)];
  /** @type {string[]} */ const problems = [];
  /** @type {Map<string, string[]>} */ const homes = new Map();
  for (const [page, mdx] of Object.entries(pages)) {
    const tables = propsTables(mdx);
    if (!tables.length) continue;
    const own = stories[page] ?? [];
    const imported = [mdx, ...own].flatMap((src) => [...pageImports(src).values()]);
    const documented = [];
    for (const t of tables) {
      if (!imported.includes(t.of) || !(t.of in components)) {
        problems.push(`${page}: PropsTable of="${t.of}" names no theme component the page imports`);
        continue;
      }
      documented.push(t.of);
      homes.set(t.of, [...(homes.get(t.of) ?? []), page]);
      if (new Set(t.names).size !== t.names.length) problems.push(`${page}: ${t.of} PropsTable repeats a row`);
      /** @type {string[]} */ let declared;
      try {
        declared = extractProps(components[t.of] ?? '');
      } catch (err) {
        problems.push(`${page}: ${t.of}: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }
      const undocumented = minus(declared, t.names);
      const stale = minus(t.names, declared);
      if (undocumented.length)
        problems.push(`${page}: ${t.of} props missing from its PropsTable: ${undocumented.join(', ')}`);
      if (stale.length)
        problems.push(`${page}: ${t.of} PropsTable rows that are not declared props: ${stale.join(', ')}`);
    }
    // C-121: overlay states are live triggers, never an overlay rendered open in page flow.
    for (const src of [mdx, ...own])
      for (const [local, spec] of pageImports(src))
        if (isOverlay(components[spec] ?? '') && !staticOpen.includes(spec))
          for (const use of stripFences(src).matchAll(new RegExp(`<${local}\\b[^>]*\\sopen[\\s=/>]`, 'g')))
            problems.push(`${page}: ${spec} rendered open in page flow (${use[0].slice(0, 40)}…); use a live trigger`);
    // C-125: a component shows its demo and states as stories, never inline on the page.
    if (!new RegExp(`<Stories\\s+of="${page}"`).test(stripFences(mdx)))
      problems.push(`${page}: no <Stories of="${page}" /> naming the page's own slug`);
    // D-SB6: Astro bundles the CSS of every module a page imports, rendered or not.
    for (const [local, spec] of pageImports(mdx))
      if (!new RegExp(`<${local}[\\s/>]`).test(stripFences(mdx)))
        problems.push(`${page}: imports ${spec} but never renders it; import it in the story that does`);
    const need = ['stories', 'props'];
    if (documented.some((spec) => isZagBacked(components[spec] ?? '', near(spec)))) need.push('events', 'keyboard');
    const missing = minus(need, headingIds(mdx));
    if (missing.length) problems.push(`${page}: no heading with id ${missing.join(', ')}`);
  }
  for (const spec of Object.keys(components)) {
    if (exempt.includes(spec)) continue;
    const at = homes.get(spec) ?? [];
    if (!at.length) problems.push(`${spec}: no showcase page documents it (<PropsTable of="${spec}">)`);
    else if (at.length > 1) problems.push(`${spec}: documented on several pages (${at.join(', ')}); keep one`);
  }
  return problems;
}
