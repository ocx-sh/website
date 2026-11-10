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
