// The Lighthouse comment workflow posts attacker-writable text, so its validator must accept exactly what
// scripts/lighthouse.mjs `summaryMarkdown` emits and reject any line that could link, mention, reference or embed.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { summaryMarkdown } from '../lighthouse.mjs';

const yml = readFileSync(join(import.meta.dirname, '..', '..', '.github/workflows/lighthouse-comment.yml'), 'utf8');
const program = /perl -CSD -0777 -ne '([^']*)'/.exec(yml)?.[1] ?? '';
const hasPerl = spawnSync('perl', ['-e', '1']).status === 0;

/** Exit status of the workflow's validator over `text`: 0 accepted, 1 rejected. */
const verdict = (text: string) =>
  spawnSync('perl', ['-CSD', '-0777', '-ne', program], { input: text, encoding: 'utf8' }).status;
/** `summary.md` as the workflow sees it: without the marker line. */
const body = (md: string) => md.split('\n').slice(1).join('\n');

const metrics = { score: 0.99, fcp: 800, lcp: 1000, tbt: 50, cls: 0.01, si: 900 };
const pass = { failures: [] as string[], metrics };
const fail = (...failures: string[]) => ({ failures, metrics });
const page = (i: number, ...runs: (typeof pass)[]) => ({ path: `/page-${i}/`, ms: 1, runs });

const real: Record<string, string> = {
  passing: summaryMarkdown([page(1, pass), page(2, pass)]),
  retried: summaryMarkdown([page(1, fail('categories:performance 0.99 | a'), pass), page(2, pass)]),
  failed: summaryMarkdown([
    page(1, fail('a', 'b'), fail('a'), fail('a', 'b')),
    { path: '/crash/', ms: 0, runs: [{ failures: ['lane exited (1) mid-audit'] }] },
  ]),
  truncated: summaryMarkdown(
    Array.from({ length: 50 }, (_, i) => page(i, fail('größe 日本語 … 0.99'), pass)),
    { limit: 3000 },
  ),
  allCached: summaryMarkdown([], { cached: 5 }),
};

describe.skipIf(!hasPerl)('lighthouse-comment validator', () => {
  it('was extracted from the workflow', () => expect(program).toContain('exit 1'));

  it('shows the truncated sample really is truncated', () => expect(real.truncated).toContain('more run rows omitted'));

  it.each(Object.keys(real))('accepts the %s summary', (name) => {
    expect(verdict(body(real[name] as string))).toBe(0);
  });

  const row = (cell: string) => `| \`/x/\` | ${cell} |\n`;
  it.each([
    ['a markdown link', '[click](https://evil.example)'],
    ['an autolink', 'https://evil.example'],
    ['a www autolink', 'www.evil.example'],
    ['an issue reference', '#12'],
    ['a GH- reference', 'GH-12'],
    ['a mention', '@user'],
    ['an image', '![img](x)'],
    ['an html tag', '<img src=x>'],
    ['a colon', 'fail: boom'],
    ['bold', '**x**'],
    ['an unclosed code span', '`oops'],
    ['an unescaped pipe in a code span', '`a | b`'],
    ['a control character in a code span', '`a‮b`'],
  ])('rejects %s in a cell', (_, cell) => expect(verdict(row(cell))).toBe(1));

  it.each([
    ['text outside a table', 'Please visit the site'],
    ['an unknown heading', '## Elsewhere'],
    ['an html comment', '<!-- ocx-lighthouse -->'],
    ['a list item', '- item'],
  ])('rejects %s as a line', (_, line) => expect(verdict(`${body(real.passing as string)}${line}\n`)).toBe(1));

  it('rejects text over 60,000 characters', () => {
    expect(verdict(`${body(real.passing as string)}${'\n'.repeat(60_000)}`)).toBe(1);
  });
});
