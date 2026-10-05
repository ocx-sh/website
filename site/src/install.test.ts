// C-306 / C-307 contract: one module exports the five install commands.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dist } from './build-site.ts';

const SHELLS = ['sh', 'pwsh', 'nu', 'fish', 'elvish'];
// Verbatim from the live ocx site: ocx/website/src/index.md (Quick Install) and docs/installation.md.
const COMMANDS: Record<string, string> = {
  sh: 'curl -fsSL https://setup.ocx.sh/sh | sh',
  pwsh: "Invoke-RestMethod 'https://setup.ocx.sh/pwsh' | Invoke-Expression",
  nu: 'curl -fsSL https://setup.ocx.sh/nu | nu',
  fish: 'curl -fsSL https://setup.ocx.sh/fish | fish',
  elvish: 'curl -fsSL https://setup.ocx.sh/elvish | elvish',
};
const load = () => import('./install.mjs') as Promise<Record<string, unknown>>;

describe('install commands', () => {
  it('exports exactly sh, pwsh, nu, fish, elvish', async () => {
    expect(Object.keys(await load()).sort()).toEqual([...SHELLS].sort());
  });

  it('each command is one non-empty line that installs from setup.ocx.sh', async () => {
    const mod = await load();
    for (const shell of SHELLS) {
      const cmd = mod[shell];
      expect(typeof cmd, shell).toBe('string');
      expect(cmd as string, shell).toMatch(/^[^\n]+$/);
      expect(cmd as string, shell).toContain('setup.ocx.sh');
    }
  });

  it('each command is the verbatim text of the live ocx site', async () => {
    const mod = await load();
    for (const shell of SHELLS) expect(mod[shell], shell).toBe(COMMANDS[shell]);
  });
});

// Pages that carry the five commands: the landing (C-306) and the install page (C-307).
const PAGES = ['index.html', 'install/index.html'];

const decode = (s: string) =>
  s.replace(/&(#x([0-9a-f]+)|#(\d+)|amp|lt|gt|quot|apos);/gi, (m, name: string, hex?: string, dec?: string) =>
    hex || dec
      ? String.fromCodePoint(hex ? Number.parseInt(hex, 16) : Number(dec))
      : (({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as Record<string, string>)[name.toLowerCase()] ?? m),
  );
/** The text of every code block on a page: the copy button's `data-code`, the exact string a reader copies. */
const codeBlocks = (html: string) => [...html.matchAll(/ data-code="([^"]*)"/g)].map((m) => decode(m[1] ?? ''));

describe('install commands on built pages (C-307)', () => {
  const five = (page: string) => codeBlocks(readFileSync(`${dist}${page}`, 'utf8')).slice(0, SHELLS.length);

  it.each(PAGES)('%s carries the five commands byte for byte, in order', (page) => {
    expect(five(page)).toEqual(SHELLS.map((s) => COMMANDS[s]));
  });

  it('every page carries identical command strings', () => {
    const [first, ...rest] = PAGES.map(five);
    for (const other of rest) expect(other).toEqual(first);
  });

  it('/install/ links setup.ocx.sh, /docs/installation without a trailing slash, and the setup-ocx step', () => {
    const html = readFileSync(`${dist}install/index.html`, 'utf8');
    expect(html).toContain('href="https://setup.ocx.sh/"');
    expect(html).toContain('href="/docs/installation"');
    expect(html).toContain('href="https://github.com/ocx-sh/setup-ocx"');
    expect(codeBlocks(html).some((c) => c.startsWith('- uses: ocx-sh/setup-ocx@'))).toBe(true);
  });
});
