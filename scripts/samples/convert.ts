// Converts VitePress and MkDocs Material Markdown into Markdown that Starlight
// renders, so real pages from consumer repos can exercise the theme.
// ponytail: line-based, covers the dialects our repos actually use (VitePress
// containers and code-groups, Material admonitions and content tabs). A real
// migration in phase 3 needs an AST pass; this only has to look right.

const ASIDE: Record<string, string> = {
  tip: 'tip',
  info: 'note',
  note: 'note',
  warning: 'caution',
  caution: 'caution',
  danger: 'danger',
};

/** Theme components the ocx VitePress pages use → their `@ocx-sh/theme/components/<file>.astro`. */
const THEME: Record<string, string> = {
  Terminal: 'Terminal',
  Tooltip: 'Tooltip',
  Tree: 'Tree',
  Node: 'TreeNode',
  Description: 'TreeDescription',
  PlatformIcons: 'PlatformIcons',
  FeatureSection: 'FeatureSection',
  DependencyExplorer: 'DependencyExplorer',
};
const STARLIGHT = ['Steps'];
/** Theme components the converter itself emits (content tabs, code groups). */
const TABS = ['Tabs', 'TabItem'];
/** Tags kept as JSX on .mdx pages; everything else in prose is escaped. `template`/`code`/`a` are HTML the pages use. */
const TAG = new RegExp(
  `(</?(?:${[...Object.keys(THEME), ...TABS, ...STARLIGHT, 'template', 'code', 'a'].join('|')})(?:\\s[^>]*)?>)`,
);

/** `<TabItem icon>` keys, longest first so "PowerShell" is not taken for "shell". */
const ICON_KEYS = ['powershell', 'nushell', 'elvish', 'shell', 'fish'];

/** Shell icon key (`<TabItem icon>`) for a tab label: case-insensitive substring, longest key first. */
export function iconForLabel(label: string): string | undefined {
  const l = label.toLowerCase();
  return ICON_KEYS.find((k) => l.includes(k));
}

/**
 * `.mdx` when the converted page imports components, else `.md`. Matches only the shape `convert` itself emits
 * (an `import … from '…';` statement right after frontmatter) rather than any line starting with the word
 * "import" — a body whose first prose line happens to read "import this" must not turn a plain page into MDX.
 */
export function outputExtension(converted: string): '.md' | '.mdx' {
  return /^---\n[\s\S]*?\n---\n\n?import (?:\{[^}]+\}|\w+) from '[^']+';\n/.test(converted) ? '.mdx' : '.md';
}

/**
 * The recorded casts a converted page plays: every `src="/casts/<path>.cast"` outside code fences, as `<path>`
 * relative to `/casts/`, unique, in order of first use. `fixture/` casts (committed, never fetched), paths with any
 * character outside `[\w./-]` (a `\` is a separator on Windows) and paths with `..`, `.` or empty segments are
 * skipped, so a page can never make fetch.ts write outside the casts directory.
 */
export function castRefs(converted: string): string[] {
  const refs = new Set<string>();
  let fence: string | null = null;
  for (const line of converted.split('\n')) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence !== null) {
      if (marker?.startsWith(fence)) fence = null;
      continue;
    }
    if (marker) {
      fence = marker;
      continue;
    }
    for (const [, path] of line.matchAll(/src="\/casts\/([^"]+\.cast)"/g)) {
      const segs = path!.split('/');
      if (!/^[\w./-]+$/.test(path!)) continue;
      if (segs[0] !== 'fixture' && !segs.some((s) => s === '' || s === '.' || s === '..')) refs.add(path!);
    }
  }
  return [...refs];
}

export function convert(source: string): string {
  const { data, body } = splitFrontmatter(source);
  const used = new Set<string>();
  let { text, h1 } = convertBody(body, data.title === undefined, false, used);
  // Components make the page MDX; convert again with prose escaped (MDX reads `{`, `<` and comments as code).
  if (used.size) ({ text, h1 } = convertBody(body, data.title === undefined, true, used));
  const front = [`title: ${JSON.stringify(data.title ?? h1 ?? 'Untitled')}`];
  if (data.description) front.push(`description: ${JSON.stringify(data.description)}`);
  if (used.has('Tabs')) used.add('TabItem');
  const imports = [...TABS, ...Object.keys(THEME)]
    .filter((name) => used.has(name))
    .map((name) => `import ${name} from '@ocx-sh/theme/components/${THEME[name] ?? name}.astro';`);
  const sl = STARLIGHT.filter((n) => used.has(n));
  if (sl.length) imports.push(`import { ${sl.join(', ')} } from '@astrojs/starlight/components';`);
  const head = imports.length ? `\n${imports.join('\n')}\n\n` : '';
  return `---\n${front.join('\n')}\n---\n${head}${text.replace(/^\n+/, '\n')}`;
}

/** An inline code span: a backtick run closed by a run of the same length (`` a `b` `` holds single backticks). */
const codeSplit = (s: string) => s.split(/((?<!`)(`+)(?!`).*?(?<!`)\2(?!`))/).filter((_, i) => i % 3 !== 2);

/** Vue template syntax → Astro JSX inside one kept tag. */
function jsxTag(tag: string): string {
  return tag
    .replace(/^<template #(\w+)>$/, '<Fragment slot="$1">')
    .replace(/^<\/template>$/, '</Fragment>')
    .replace(/^<Description>$/, '<Description slot="description">')
    .replace(/\s:([\w-]+)="([^"]*)"/g, ' $1={$2}');
}

/**
 * Escapes `{ } <` outside inline code and known tags as entities (a backslash would be swallowed by a GFM autolink
 * literal) so MDX reads them as text; `<https://…>` autolinks become bare URLs. Known tags become JSX (jsxTag).
 */
function escapeProse(line: string): string {
  return codeSplit(line)
    .map((part, i) =>
      i % 2
        ? part
        : part
            .split(TAG)
            .map((p, j) =>
              j % 2
                ? jsxTag(p)
                : p.replace(/<(https?:\/\/[^>\s]+)>/g, '$1').replace(/[{}<]/g, (c) => `&#${c.charCodeAt(0)};`),
            )
            .join(''),
    )
    .join('');
}

function convertBody(
  body: string,
  liftH1: boolean,
  mdx: boolean,
  used: Set<string>,
): { text: string; h1?: string | undefined } {
  const lines = body.split('\n');
  const out: string[] = [];
  const esc = mdx ? escapeProse : (s: string) => s;
  let title: string | undefined;
  let lookForH1 = liftH1;
  const closers: string[] = []; // one entry per open ::: container
  let fence: string | null = null;
  let tabItemOpen = false; // inside a code-group, a <TabItem> awaits its </TabItem>
  let inComment = false;
  let tick = ''; // backtick run of an inline code span the previous prose line left open (spans may wrap)

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]!;

    if (fence !== null) {
      out.push(line);
      if (line.trimStart().startsWith(fence)) fence = null;
      continue;
    }

    const open = /^(\s*)(`{3,}|~{3,})(\S*)\s*(?:\[([^\]]+)\])?(.*)$/.exec(line);
    if (open) {
      fence = open[2]!;
      // Test-harness fence tags (`python-no-run`) are not highlighter languages.
      const lang = open[3]!.replace(/^python-[\w-]+$/, 'python');
      const label = open[4];
      const rest = open[5] ? ` ${open[5]}` : '';
      if (closers.at(-1) === 'tabs') {
        used.add('Tabs');
        if (tabItemOpen) out.push('', '</TabItem>', '');
        out.push(tabItem(label ?? lang), '');
        tabItemOpen = true;
        out.push(`${open[1]}${fence}${lang}${label ? '' : rest}`);
        continue;
      }
      const meta = label ? ` title="${label}"` : '';
      out.push(`${open[1]}${fence}${lang}${meta}${label ? '' : rest}`);
      continue;
    }

    if (lookForH1) {
      const h1 = /^#\s+(.+?)\s*$/.exec(line);
      if (h1) {
        title = stripAnchor(h1[1]!);
        lookForH1 = false;
        continue;
      }
    }

    const vp = /^:{3,}\s*([a-z-]+)\s*(.*)$/.exec(line);
    if (vp) {
      const [, kind, label] = vp as unknown as [string, string, string];
      if (kind === 'code-group') {
        out.push('<Tabs syncKey="shell">', '');
        closers.push('tabs');
        tabItemOpen = false;
      } else if (kind === 'details') {
        // MDX needs the opening tag alone on its line to parse the body as Markdown.
        out.push(`<details>${mdx ? '\n' : ''}<summary>${esc(label || 'Details')}</summary>`, '');
        closers.push('</details>');
      } else if (ASIDE[kind]) {
        out.push(`:::${ASIDE[kind]}${label ? `[${esc(label)}]` : ''}`);
        closers.push(':::');
      } else {
        // mkdocstrings `::: ocx_sdk` and other unknowns: say what is missing.
        out.push(`:::note[Not rendered in samples]`, `\`${line.trim()}\``, ':::');
      }
      continue;
    }
    if (/^:{3,}\s*$/.test(line) && closers.length > 0) {
      const closer = closers.pop()!;
      if (closer === '</details>') out.push('', closer);
      else if (closer === 'tabs') out.push(...(tabItemOpen ? ['', '</TabItem>'] : []), '', '</Tabs>', '');
      else out.push(closer);
      continue;
    }

    const admonition = /^(!!!|\?\?\?\+?)\s+([a-z]+)(?:\s+"([^"]*)")?\s*$/.exec(line);
    if (admonition) {
      const kind = ASIDE[admonition[2]!] ?? 'note';
      const block = takeIndented(lines, i + 1);
      out.push(
        `:::${kind}${admonition[3] ? `[${esc(admonition[3])}]` : ''}`,
        ...convertBody(block.text, false, mdx, used).text.split('\n'),
        ':::',
      );
      i = block.end - 1;
      continue;
    }

    const tab = /^===\s+"([^"]+)"\s*$/.exec(line);
    if (tab) {
      const block = takeIndented(lines, i + 1);
      // Material tabs: consecutive `=== "X"` blocks share one <Tabs>.
      const prev = out.findLast((l) => l.trim() !== '');
      if (prev !== '</TabItem>') out.push('<Tabs syncKey="shell">', '');
      used.add('Tabs');
      out.push(tabItem(tab[1]!), '', convertBody(block.text, false, mdx, used).text, '', '</TabItem>');
      const next = lines.slice(block.end).find((l) => l.trim() !== '');
      if (next === undefined || !/^===\s+"/.test(next)) out.push('', '</Tabs>', '');
      i = block.end - 1;
      continue;
    }

    if (mdx) {
      if (inComment) {
        const end = line.indexOf('-->');
        if (end < 0) continue;
        inComment = false;
        line = line.slice(end + 3);
      }
      line = line.replace(/<!--[\s\S]*?-->/g, '');
      const start = line.indexOf('<!--');
      if (start >= 0) {
        inComment = true;
        line = line.slice(0, start);
      }
    }
    line = line.replace(/^(#{2,6}\s+.*?)\s*\{#[^}]+\}\s*$/, '$1');
    for (const [, name] of line.matchAll(/<([A-Z]\w*)/g))
      if (name! in THEME || TABS.includes(name!) || STARLIGHT.includes(name!)) used.add(name!);
    if (!mdx) {
      out.push(line);
      continue;
    }
    let head = '';
    if (line.trim() === '') tick = '';
    if (tick) {
      const end = line.indexOf(tick);
      if (end < 0) {
        out.push(line);
        continue;
      }
      head = line.slice(0, end + tick.length);
      line = line.slice(end + tick.length);
      tick = '';
    }
    const tail = codeSplit(line).at(-1)!;
    const unclosed = /`+/.exec(tail);
    const cut = unclosed ? line.length - tail.length + unclosed.index : line.length;
    if (unclosed) tick = unclosed[0];
    out.push(head + esc(line.slice(0, cut)) + line.slice(cut));
  }

  return { text: out.join('\n'), h1: title };
}

/** A `<TabItem>` opening tag, with the shell icon its label names (C-152). */
function tabItem(label: string): string {
  const icon = iconForLabel(label);
  return `<TabItem label={${JSON.stringify(label)}}${icon ? ` icon="${icon}"` : ''}>`;
}

function stripAnchor(text: string): string {
  return text.replace(/\s*\{#[^}]+\}\s*$/, '');
}

function splitFrontmatter(source: string): { data: Record<string, string>; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(source);
  if (!m) return { data: {}, body: source };
  const data: Record<string, string> = {};
  for (const l of m[1]!.split('\n')) {
    const kv = /^(title|description):\s*(.+)$/.exec(l);
    if (kv) data[kv[1]!] = kv[2]!.replace(/^(['"])(.*)\1$/, '$2');
  }
  return { data, body: source.slice(m[0].length) };
}

/** Collects the 4-space-indented block starting at `start`, dedented. */
function takeIndented(lines: string[], start: number): { text: string; end: number } {
  let end = start;
  while (end < lines.length && (lines[end]!.startsWith('    ') || lines[end]!.trim() === '')) end++;
  while (end > start && lines[end - 1]!.trim() === '') end--;
  return {
    text: lines
      .slice(start, end)
      .map((l) => l.slice(4))
      .join('\n'),
    end,
  };
}
