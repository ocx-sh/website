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

export function convert(source: string): string {
  const { data, body } = splitFrontmatter(source);
  const { text, h1 } = convertBody(body, data.title === undefined);
  const front = [`title: ${JSON.stringify(data.title ?? h1 ?? 'Untitled')}`];
  if (data.description) front.push(`description: ${JSON.stringify(data.description)}`);
  return `---\n${front.join('\n')}\n---\n${text.replace(/^\n+/, '\n')}`;
}

function convertBody(body: string, liftH1: boolean): { text: string; h1?: string | undefined } {
  const lines = body.split('\n');
  const out: string[] = [];
  let title: string | undefined;
  let lookForH1 = liftH1;
  const closers: string[] = []; // one entry per open ::: container
  let fence: string | null = null;
  let tabLabel: string | null = null;

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
      const label = open[4] ?? tabLabel;
      tabLabel = null;
      const meta = label ? ` title="${label}"` : '';
      out.push(`${open[1]}${fence}${lang}${meta}${label ? '' : open[5]}`);
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
        closers.push('');
      } else if (kind === 'details') {
        out.push(`<details><summary>${label || 'Details'}</summary>`, '');
        closers.push('</details>');
      } else if (ASIDE[kind]) {
        out.push(`:::${ASIDE[kind]}${label ? `[${label}]` : ''}`);
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
      else if (closer) out.push(closer);
      continue;
    }

    const admonition = /^(!!!|\?\?\?\+?)\s+([a-z]+)(?:\s+"([^"]*)")?\s*$/.exec(line);
    if (admonition) {
      const kind = ASIDE[admonition[2]!] ?? 'note';
      const block = takeIndented(lines, i + 1);
      out.push(`:::${kind}${admonition[3] ? `[${admonition[3]}]` : ''}`, ...convertBody(block.text, false).text.split('\n'), ':::');
      i = block.end - 1;
      continue;
    }

    const tab = /^===\s+"([^"]+)"\s*$/.exec(line);
    if (tab) {
      const block = takeIndented(lines, i + 1);
      tabLabel = tab[1]!;
      const inner = block.text.split('\n');
      // A tab holding a single code block becomes a titled code block.
      if (!inner.some((l) => /^(`{3,}|~{3,})/.test(l))) out.push(`**${tabLabel}**`, '');
      lines.splice(i + 1, block.end - i - 1, ...inner);
      continue;
    }

    line = line.replace(/^(#{2,6}\s+.*?)\s*\{#[^}]+\}\s*$/, '$1');
    out.push(line);
  }

  return { text: out.join('\n'), h1: title };
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
  return { text: lines.slice(start, end).map((l) => l.slice(4)).join('\n'), end };
}
