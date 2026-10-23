// C-307: the landing carries the theme's InstallCommand, one bar per shell. The component owns the commands
// (components-install-command.test.ts); this checks they reach the built page byte for byte, in order.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dist } from './build-site.ts';

const COMMANDS = [
  'curl -fsSL https://setup.ocx.sh/sh | sh',
  'irm https://setup.ocx.sh/pwsh | iex',
  'nu -c (http get https://setup.ocx.sh/nu)',
  'curl -fsSL https://setup.ocx.sh/fish | fish',
  'elvish -c (e:curl -fsSL https://setup.ocx.sh/elvish | slurp)',
];

describe('install commands on the landing (C-307)', () => {
  it('index.html carries the five commands as command bars, in order', () => {
    const html = readFileSync(`${dist}index.html`, 'utf8');
    // The text is highlighted: token spans inside the code element.
    const bars = [...html.matchAll(/<code class="ocx-cmdbar__text"[^>]*>(.*?)<\/code>/g)].map((m) =>
      m[1]?.replace(/<[^>]+>/g, '').trim(),
    );
    expect(bars).toEqual(COMMANDS);
  });
});
