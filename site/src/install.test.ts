// C-307: the landing carries the theme's InstallCommand, as a picker bar over every shell in the hero and again in the call to action. The component owns the commands
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
  it('index.html carries the five commands in both bars, in order (the first shown)', () => {
    const html = readFileSync(`${dist}index.html`, 'utf8');
    // The shown text is highlighted: token spans inside the code element.
    const shown = [...html.matchAll(/<code class="ocx-cmdbar__text"[^>]*>(.*?)<\/code>/g)].map((m) =>
      m[1]?.replace(/<[^>]+>/g, '').trim(),
    );
    // The page's `ocx add` bars hold one command each and are not install bars.
    expect(shown.filter((t) => t?.includes('setup.ocx.sh'))).toEqual([COMMANDS[0], COMMANDS[0]]);
    const picked = [...html.matchAll(/data-choices="([^"]*)"/g)].map((m) =>
      (JSON.parse((m[1] ?? '').replaceAll('&#34;', '"').replaceAll('&quot;', '"')) as { command: string }[]).map(
        (c) => c.command,
      ),
    );
    expect(picked.filter((p) => p.length > 1)).toEqual([COMMANDS, COMMANDS]);
  });
});
