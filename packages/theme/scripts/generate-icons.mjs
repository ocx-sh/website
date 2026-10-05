// Writes src/icons/icons.generated.mjs, icons.sources.generated.mjs and icons.d.ts from NAME_MAP: UI icons from Lucide
// (ISC), OS/brand/shell glyphs from Simple Icons (CC0-1.0), and a few custom bodies neither set has (Tux, cmd).
// Custom only for a brand missing from Simple Icons (or over the 2 KB cap), copied verbatim from a
// licensed upstream file, with its source URL and licence beside the entry. Never drawn by hand.
// The @iconify-json packages are devDependencies only: the output is checked in and never reads
// their JSON at runtime (toast and tree ship the registry to the client).
// Rerun: `pnpm --filter @ocx-sh/theme icons`. A test fails when the checked-in files are stale.
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

/**
 * @typedef {'interface' | 'action' | 'brand' | 'os' | 'shell'} IconGroup
 * @typedef {{ viewBox: string, body: string, stroke?: number }} Custom
 * @typedef {[source: 'lucide' | 'simple-icons', icon: string] | [source: 'custom', icon: Custom]} Source
 */

// Material Design Icons "linux": Simple Icons' Tux is 5.3 KB (over the 2 KB cap). The `d` attribute is
// verbatim from https://github.com/Templarian/MaterialDesign/blob/master/svg/linux.svg, Apache-2.0
// (THIRD_PARTY_NOTICES).
const TUX =
  'M14.62,8.35C14.2,8.63 12.87,9.39 12.67,9.54C12.28,9.85 11.92,9.83 11.53,9.53C11.33,9.37 10,8.61 9.58,8.34C9.1,8.03 9.13,7.64 9.66,7.42C11.3,6.73 12.94,6.78 14.57,7.45C15.06,7.66 15.08,8.05 14.62,8.35M21.84,15.63C20.91,13.54 19.64,11.64 18,9.97C17.47,9.42 17.14,8.8 16.94,8.09C16.84,7.76 16.77,7.42 16.7,7.08C16.5,6.2 16.41,5.3 16,4.47C15.27,2.89 14,2.07 12.16,2C10.35,2.05 9,2.81 8.21,4.4C8,4.83 7.85,5.28 7.75,5.74C7.58,6.5 7.43,7.29 7.25,8.06C7.1,8.71 6.8,9.27 6.29,9.77C4.68,11.34 3.39,13.14 2.41,15.12C2.27,15.41 2.13,15.7 2.04,16C1.85,16.66 2.33,17.12 3.03,16.96C3.47,16.87 3.91,16.78 4.33,16.65C4.74,16.5 4.9,16.6 5,17C5.65,19.15 7.07,20.66 9.24,21.5C13.36,23.06 18.17,20.84 19.21,16.92C19.28,16.65 19.38,16.55 19.68,16.65C20.14,16.79 20.61,16.89 21.08,17C21.57,17.09 21.93,16.84 22,16.36C22.03,16.1 21.94,15.87 21.84,15.63';

/** @type {Record<string, [Source, IconGroup, string]>} name → source, catalog group, search keywords. */
export const NAME_MAP = {
  // Interface: disclosure, navigation, dismissal, tones.
  'chevron-down': [['lucide', 'chevron-down'], 'interface', 'caret expand disclosure dropdown open'],
  'chevron-right': [['lucide', 'chevron-right'], 'interface', 'caret collapse tree next'],
  'arrow-right': [['lucide', 'arrow-right'], 'interface', 'link go forward continue more'],
  close: [['lucide', 'x'], 'interface', 'x dismiss cancel remove'],
  check: [['lucide', 'check'], 'interface', 'done success copied tick confirm'],
  alert: [['lucide', 'circle-alert'], 'interface', 'error warning danger exclamation'],
  info: [['lucide', 'info'], 'interface', 'tone information note help'],
  success: [['lucide', 'circle-check'], 'interface', 'tone done ok passed'],
  warning: [['lucide', 'triangle-alert'], 'interface', 'tone caution triangle'],
  error: [['lucide', 'circle-x'], 'interface', 'tone failed danger x'],
  search: [['lucide', 'search'], 'interface', 'find filter magnifier'],
  menu: [['lucide', 'menu'], 'interface', 'hamburger navigation bars'],
  more: [['lucide', 'ellipsis'], 'interface', 'ellipsis actions overflow kebab context menu'],
  // DataTable renders the three; CSS shows the one matching the header's aria-sort.
  sort: [['lucide', 'arrow-up-down'], 'interface', 'order column table unsorted'],
  'sort-asc': [['lucide', 'arrow-up-narrow-wide'], 'interface', 'order ascending column table sorted'],
  'sort-desc': [['lucide', 'arrow-down-wide-narrow'], 'interface', 'order descending column table sorted'],
  sun: [['lucide', 'sun'], 'interface', 'light theme mode'],
  moon: [['lucide', 'moon'], 'interface', 'dark theme mode night'],
  monitor: [['lucide', 'monitor'], 'interface', 'auto system theme screen'],
  // Actions: menu items and buttons that do something.
  minus: [['lucide', 'minus'], 'action', 'subtract decrease remove less'],
  plus: [['lucide', 'plus'], 'action', 'add create new tag'],
  copy: [['lucide', 'copy'], 'action', 'clipboard duplicate'],
  download: [['lucide', 'download'], 'action', 'save install archive get'],
  external: [['lucide', 'external-link'], 'action', 'open new window tab outside link'],
  pin: [['lucide', 'pin'], 'action', 'pushpin keep fix version'],
  edit: [['lucide', 'pencil'], 'action', 'pencil rename change write'],
  trash: [['lucide', 'trash'], 'action', 'delete remove bin'],
  play: [['lucide', 'play'], 'action', 'start resume playback terminal'],
  pause: [['lucide', 'pause'], 'action', 'stop hold playback terminal'],
  fullscreen: [['lucide', 'maximize'], 'interface', 'expand enlarge maximize terminal'],
  'fullscreen-exit': [['lucide', 'minimize'], 'interface', 'collapse shrink minimize terminal'],
  // CommandBar scope picker: user-wide vs. this project.
  globe: [['lucide', 'globe'], 'interface', 'global world scope user internet'],
  folder: [['lucide', 'folder'], 'interface', 'project directory scope local files'],
  // Landing feature cards and sections (root site): one icon, one idea. `box` is Lucide's package (a reserved word as an export).
  box: [['lucide', 'package'], 'interface', 'box registry artifact oci bundle'],
  layers: [['lucide', 'layers'], 'interface', 'stack platforms cross-platform multi'],
  lock: [['lucide', 'lock'], 'interface', 'locked reproducible pinned secure'],
  workflow: [['lucide', 'workflow'], 'interface', 'automation pipeline ci steps flow'],
  blocks: [['lucide', 'blocks'], 'interface', 'compose environment modules building blocks'],
  'hard-drive': [['lucide', 'hard-drive'], 'interface', 'disk offline storage air-gap usb'],
  // Brand.
  github: [['simple-icons', 'github'], 'brand', 'git repository source code'],
  // Operating systems (PlatformIcons).
  linux: [['custom', { viewBox: '0 0 24 24', body: `<path d="${TUX}"/>` }], 'os', 'tux penguin os platform'],
  apple: [['simple-icons', 'apple'], 'os', 'macos darwin mac os platform'],
  windows: [['simple-icons', 'windows'], 'os', 'microsoft win os platform'],
  // Shells (tab icons, `<TabItem icon>`).
  shell: [['lucide', 'square-terminal'], 'shell', 'sh bash zsh posix terminal'],
  powershell: [['simple-icons', 'powershell'], 'shell', 'pwsh windows terminal'],
  nushell: [['simple-icons', 'nushell'], 'shell', 'nu terminal'],
  fish: [['simple-icons', 'fishshell'], 'shell', 'fish shell terminal'],
  elvish: [['lucide', 'lambda'], 'shell', 'elv terminal'],
  // Custom: Windows cmd.exe. vscode-icons file-type-shell, MIT, elements verbatim minus the style fills:
  // https://github.com/vscode-icons/vscode-icons/blob/master/icons/file_type_shell.svg
  cmd: [
    [
      'custom',
      {
        viewBox: '0 0 32 32',
        body: '<path d="M29.4,27.6H2.5V4.5H29.4Zm-25.9-1H28.4V5.5H3.5Z"/><polygon points="6.077 19.316 5.522 18.484 10.366 15.255 5.479 11.184 6.12 10.416 12.035 15.344 6.077 19.316"/><rect x="12.7" y="18.2" width="7.8" height="1"/><rect x="2.5" y="5.5" width="26.9" height="1.9"/>',
      },
    ],
    'shell',
    'cmd.exe command prompt windows console terminal',
  ],
};

/** Lucide's per-icon wrapper attributes: Icon.astro sets them once on the <svg>. */
const LUCIDE_ATTRS =
  / (?:fill="none"|stroke="currentColor"|stroke-linecap="round"|stroke-linejoin="round"|stroke-width="2")/g;

/** @typedef {{ icons: Record<string, { body: string }>, aliases?: Record<string, { parent: string }>, width?: number, height?: number }} IconifySet */

// `unknown`, not `any`: typescript-eslint reads the call under a JSDoc cast, not the cast.
/** @param {string} id @returns {unknown} */
const load = (id) => require(id);
/** @param {string} pkg @returns {IconifySet} */
const set = (pkg) => /** @type {IconifySet} */ (load(`@iconify-json/${pkg}/icons.json`));
/** @param {string} pkg @returns {string} */
const version = (pkg) => /** @type {{ version: string }} */ (load(`@iconify-json/${pkg}/package.json`)).version;

/**
 * One registry entry from its source.
 * @param {string} name
 * @param {Source} source
 * @returns {Custom}
 */
function resolve(name, [from, id]) {
  if (from === 'custom') return id;
  const json = set(from);
  const raw = json.icons[id] ?? json.icons[json.aliases?.[id]?.parent ?? ''];
  if (typeof raw?.body !== 'string') throw new Error(`icons: ${name}: no ${from}:${id}`);
  const viewBox = `0 0 ${json.width ?? 16} ${json.height ?? 16}`;
  const line = from === 'lucide';
  const body = line
    ? raw.body.replace(LUCIDE_ATTRS, '').replace(/^<g>([\s\S]*)<\/g>$/, '$1')
    : raw.body.replace(' fill="currentColor"', '');
  if (/fill=|stroke|<g\b/.test(body)) throw new Error(`icons: ${name}: unexpected ${from} markup ${body}`);
  return { viewBox, body, ...(line && { stroke: 2 }) };
}

/** A single-quoted literal, as oxfmt writes it (so formatting the output is a no-op). @param {string} s */
const q = (s) => {
  if (/['\\\n]/.test(s)) throw new Error(`icons: cannot quote ${s}`);
  return `'${s}'`;
};

/** A registry name as a JS identifier: `chevron-down` → `chevronDown`. @param {string} name */
const ident = (name) =>
  name.replace(/-([a-z])/g, (/** @type {string} */ _, /** @type {string} */ c) => c.toUpperCase());

/** @returns {{ mjs: string, sources: string, dts: string }} The generated files' text. */
export function generate() {
  const header =
    `// Generated by packages/theme/scripts/generate-icons.mjs from @iconify-json/lucide ${version('lucide')} (ISC)\n` +
    `// and @iconify-json/simple-icons ${version('simple-icons')} (CC0-1.0). Do not edit: change NAME_MAP and run\n` +
    '// `pnpm --filter @ocx-sh/theme icons`.\n';
  // One named export per glyph (camelCased), so a client chunk that needs a few (toast) imports
  // just those and tree-shakes the rest; ICONS is built from them.
  const consts = Object.entries(NAME_MAP).map(([name, [source, group, keywords]]) => {
    const { viewBox, body, stroke } = resolve(name, source);
    const fields = [`viewBox: ${q(viewBox)}`, `body: ${q(body)}`, ...(stroke ? [`stroke: ${stroke}`] : [])];
    fields.push(`group: ${q(group)}`, `keywords: ${q(keywords)}`);
    return (
      "/** @satisfies {import('./icons.mjs').IconDef} */\n" +
      `export const ${ident(name)} = {\n${fields.map((f) => `  ${f},\n`).join('')}};\n`
    );
  });
  const mjs =
    header +
    consts.join('') +
    `export const ICONS = {\n${Object.keys(NAME_MAP)
      .map((name) => `  ${/^[a-z]+$/.test(name) ? name : `${q(name)}: ${ident(name)}`},\n`)
      .join('')}};\n`;
  // Separate module: the catalog's Set column needs it, the client bundles that ship ICONS do not.
  const sources =
    header +
    `export const ICON_SOURCES = {\n${Object.entries(NAME_MAP)
      .map(([name, [[from]]]) => `  ${/^[a-z]+$/.test(name) ? name : q(name)}: ${q(from)},\n`)
      .join('')}};\n`;
  const dts =
    header +
    `export type IconName =\n${Object.keys(NAME_MAP)
      .map((n) => `  | ${q(n)}`)
      .join('\n')};\n` +
    "export type IconGroup = 'interface' | 'action' | 'brand' | 'os' | 'shell';\n" +
    'export type IconDef = {\n' +
    '  viewBox: string;\n' +
    '  /** SVG children, inserted verbatim; no colour of their own (currentColor). */\n' +
    '  body: string;\n' +
    '  /** Line icon: stroke width in viewBox units (the `--ocx-icon-stroke` token overrides it). Absent: filled. */\n' +
    '  stroke?: number;\n' +
    '  group: IconGroup;\n' +
    '  /** Extra words the catalog search matches. */\n' +
    '  keywords: string;\n' +
    '};\n' +
    'export const ICONS: Record<IconName, IconDef>;\n' +
    '/** Registry names in catalog order. */\n' +
    'export const ICON_NAMES: IconName[];\n' +
    '/** Where each glyph comes from (and so its licence). */\n' +
    "export const ICON_SOURCES: Record<IconName, 'lucide' | 'simple-icons' | 'custom'>;\n";
  return { mjs, sources, dts };
}

export const OUT = {
  mjs: fileURLToPath(new URL('../src/icons/icons.generated.mjs', import.meta.url)),
  sources: fileURLToPath(new URL('../src/icons/icons.sources.generated.mjs', import.meta.url)),
  dts: fileURLToPath(new URL('../src/icons/icons.d.ts', import.meta.url)),
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = generate();
  writeFileSync(OUT.mjs, out.mjs);
  writeFileSync(OUT.sources, out.sources);
  writeFileSync(OUT.dts, out.dts);
}
