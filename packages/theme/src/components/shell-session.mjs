// Build-time slimming of the Expressive Code lines inside a ShellSession: a token run that only carries
// whitespace needs no colour, and neighbours of the same colour are one span.

const CODE = /(<div class="code">)([\s\S]*?)(<\/div>)/g;
const TOKEN = /<span( style="(?:--\d+:[^";]*;?)+")>([^<]*)<\/span>|([^<]+)/g;

/**
 * Merge adjacent same-style token spans of every code line, and drop the wrapper of whitespace-only
 * runs (a run between two tokens of one style joins them). A line holding any other markup is left as is.
 * @param {string} html
 * @returns {string}
 */
export function slimTokens(html) {
  return html.replace(
    CODE,
    (
      /** @type {string} */ whole,
      /** @type {string} */ open,
      /** @type {string} */ inner,
      /** @type {string} */ close,
    ) => {
      /** @type {{ style: string, text: string }[]} */
      const runs = [];
      let at = 0;
      for (const m of inner.matchAll(TOKEN)) {
        if (m.index !== at) return whole;
        at += m[0].length;
        runs.push({ style: m[1] ?? '', text: m[2] ?? m[3] ?? '' });
      }
      const solid = runs.map((r) => (r.text.trim() ? r.style || '-' : ''));
      runs.forEach((run, i) => {
        if (!run.style || run.text.trim()) return;
        const a = solid.slice(0, i).findLast(Boolean);
        const b = solid.slice(i + 1).find(Boolean);
        run.style = a && a === b && a !== '-' ? a : '';
      });
      const out = [];
      for (const run of runs) {
        const last = out[out.length - 1];
        if (last && last.style === run.style) last.text += run.text;
        else out.push({ ...run });
      }
      return open + out.map((r) => (r.style ? `<span${r.style}>${r.text}</span>` : r.text)).join('') + close;
    },
  );
}

const LINE = '<div class="ec-line';
const MARKED = '<div data-ocx-continued class="ec-line';
// Languages whose `#` starts a comment and whose command lines wear the `$`: the shells and PowerShell.
const SHELL = /data-language="(sh|bash|zsh|shell|shellscript|console|powershell|pwsh|ps1)"/;
const POWERSHELL = new Set(['powershell', 'pwsh', 'ps1']);
const ENTITY = { quot: '"', amp: '&', lt: '<', gt: '>', apos: "'" };
// `<<` or `<<-` and its delimiter, bare, quoted or backslash-escaped; `<<<` is a here-string, not a heredoc.
const HEREDOC = /<<(-?)\s*(?:'([^']+)'|"([^"]+)"|\\?([\w.-]+))/y;

/** The text of one rendered `ec-line`, tags dropped and entities decoded. @param {string} line a piece after the `LINE` split */
const textOf = (line) =>
  // `line` starts inside the opening `<div class="ec-line…">` tag: drop its tail first.
  (line.split('</code>')[0] ?? '')
    .replace(/^[^>]*>/, '')
    .replace(/<[^>]*>/g, '')
    .replace(
      /&(?:#x([\da-f]+)|#(\d+)|(quot|amp|lt|gt|apos));/gi,
      (
        /** @type {string} */ _,
        /** @type {string | undefined} */ hex,
        /** @type {string | undefined} */ dec,
        /** @type {'quot'} */ name,
      ) => (hex || dec ? String.fromCodePoint(parseInt(hex ?? dec ?? '0', hex ? 16 : 10)) : ENTITY[name]),
    );

/**
 * Marks the lines of a command that are not commands (`data-ocx-continued`, drawn without the `$` but with its
 * width, so the indent holds): the line after one ending in `\` (PowerShell: a backtick or `|`), whatever it holds;
 * in a shell or PowerShell fence also a blank or `#` comment line, a line that starts inside a quoted string a
 * line before left open, the body of a heredoc up to its terminator and, in PowerShell, a line inside a `{` or `(`
 * block an earlier line left open (its closing `}` or `)` line included). Quotes count outside `#` comments;
 * `\` escapes in sh, a backtick in PowerShell, and in sh a single quote holds no escape.
 * @param {string} block the fence up to the next session marker, as rendered HTML
 * @returns {string}
 */
export function continued(block) {
  const [head = '', ...lines] = block.split(LINE);
  const language = SHELL.exec(head)?.[1];
  const ps = language !== undefined && POWERSHELL.has(language);
  /** @type {string | null} the quote open at the end of the previous line */
  let quote = null;
  let depth = 0;
  /** @type {RegExp | null} the heredoc terminator line being waited for */
  let terminator = null;
  let previous = '';
  const marks = lines.map((l, k) => {
    const text = textOf(l);
    const comment = language !== undefined && /^\s*(?:#|$)/.test(text);
    let mark = k > 0 && (/\\$/.test(previous) || (ps && /[`|]$/.test(previous)));
    previous = text.trimEnd();
    if (language === undefined) return mark;
    if (terminator) {
      if (terminator.test(text)) terminator = null;
      return true;
    }
    mark ||= comment || quote !== null || depth > 0;
    if (comment && quote === null) return mark;
    const escape = ps ? '`' : '\\';
    for (let i = 0; i < text.length; i++) {
      const c = /** @type {string} */ (text[i]);
      if (quote === "'" && !ps) {
        if (c === "'") quote = null;
      } else if (c === escape) i++;
      else if (quote) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'") quote = c;
      else if (c === '#' && (i === 0 || /\s/.test(/** @type {string} */ (text[i - 1])))) break;
      else if (ps && '{('.includes(c)) depth++;
      else if (ps && '})'.includes(c)) depth = Math.max(0, depth - 1);
      else if (!ps && c === '<' && text[i + 1] === '<' && text[i + 2] !== '<' && text[i - 1] !== '<') {
        HEREDOC.lastIndex = i;
        const m = HEREDOC.exec(text);
        if (m) {
          const word = (m[2] ?? m[3] ?? m[4] ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          terminator = new RegExp(`^${m[1] ? '\\t*' : ''}${word}\\s*$`);
          i += m[0].length - 1;
        } else i++;
      }
    }
    return mark;
  });
  return head + lines.map((l, k) => (marks[k] ? MARKED : LINE) + l).join('');
}
