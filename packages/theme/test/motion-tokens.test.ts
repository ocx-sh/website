// C-302 / D-R7 (a) guard: every transition and animation in the theme reads the motion tokens.
// Scans each .astro/.css/.mjs under src (tokens.css defines the tokens; generated icons carry no CSS)
// and fails on `transition: all`, a raw time literal (only `0s` is allowed) or a raw easing keyword.
// `linear` stays allowed: infinite loops (Loader, ProgressCircle) need a constant rate.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = new URL('../src/', import.meta.url).pathname;
const SKIP = new Set(['tokens.css', 'icons.generated.mjs', 'icons.sources.generated.mjs']);

const DECL = /(?<![\w-])((?:transition|animation)(?:-[a-z]+)*)\s*:\s*([^;{}]+)/g;
const TIME = /\b\d*\.?\d+m?s\b/g;
const EASING = /(?<![\w-])(?:ease(?:-in-out|-in|-out)?(?![\w-])|cubic-bezier\(|steps\()/;

/** Every rule break in `text`, as `prop: value — reason`. */
export function violations(text: string): string[] {
  const code = text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const out: string[] = [];
  for (const [, prop = '', raw = ''] of code.matchAll(DECL)) {
    const value = raw.trim();
    const at = `${prop}: ${value.replace(/\s+/g, ' ')}`;
    if ((prop === 'transition' || prop === 'transition-property') && /(^|,)\s*all\b/.test(value))
      out.push(`${at} — transition: all`);
    const times = (value.match(TIME) ?? []).filter((t) => !/^0?\.?0*m?s$/.test(t));
    if (times.length) out.push(`${at} — raw time ${times.join(', ')}`);
    if (EASING.test(value)) out.push(`${at} — raw easing`);
  }
  return out;
}

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return files(path);
    return /\.(astro|css|mjs)$/.test(e.name) && !SKIP.has(e.name) ? [path] : [];
  });
}

describe('motion tokens (C-302)', () => {
  it('flags the three breaks and passes the token forms', () => {
    expect(violations('a { transition: all var(--ocx-duration-base); }')).toHaveLength(1);
    expect(violations('a { transition: color 150ms; }')).toHaveLength(1);
    expect(violations('a { animation: x var(--ocx-duration-slow) ease both; }')).toHaveLength(1);
    expect(violations('a { transition-timing-function: cubic-bezier(0, 0, 1, 1); }')).toHaveLength(1);
    expect(violations('a { animation: x calc(var(--t) * 4) steps(4) infinite; }')).toHaveLength(1);
    expect(
      violations(
        `a { transition: opacity var(--ocx-duration-base) var(--ocx-ease-out), display var(--ocx-duration-base) allow-discrete;
             animation: spin calc(var(--ocx-duration-slow) * 4) linear infinite; transition-delay: 0s; }
         /* transition: all 1s ease */`,
      ),
    ).toEqual([]);
  });

  it('every transition and animation under src reads the motion tokens', () => {
    const found = files(SRC).flatMap((f) =>
      violations(readFileSync(f, 'utf8')).map((v) => `${relative(SRC, f)}: ${v}`),
    );
    expect(found).toEqual([]);
  });
});
