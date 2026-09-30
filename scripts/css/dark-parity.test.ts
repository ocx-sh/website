// C-029: dark-parity.mjs is symmetric between the default and dark colour scopes (gate.md › dark-parity.mjs).
// Assumption (from packages/theme/src/tokens.css): default scope = `:root` / `:root[data-theme='light']`,
// dark scope = `.dark` (VitePress) / `:root[data-theme='dark']` (Starlight); minified builds drop the
// attribute quotes, so the fixtures use `:root[data-theme=dark]` as it appears in dist.
// Colour tokens only: non-colour tokens (spacing, z-index) declared once in the default scope are exempt.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const script = new URL('dark-parity.mjs', import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'dark-parity-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let n = 0;
function run(ext: string, body: string) {
  const p = join(dir, `f${n++}${ext}`);
  writeFileSync(p, body);
  return spawnSync(process.execPath, [script, p], { encoding: 'utf8' });
}

const light = ':root,:root[data-theme=light]{--ocx-color-bg:#fff;--ocx-color-fg:#111}';
const dark = '.dark,:root[data-theme=dark]{--ocx-color-bg:#000;--ocx-color-fg:#eee}';

describe('dark-parity.mjs', () => {
  it('C-029: symmetric scopes pass with empty output', () => {
    const r = run('.css', light + dark);
    expect(r.stdout).toBe('');
    expect(r.status).toBe(0);
  });

  it('C-029: a colour token in the dark scope missing from the default scope goes red', () => {
    const r = run('.css', light + dark.replace('}', ';--ocx-color-dark-only:#333}'));
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('--ocx-color-dark-only');
  });

  it('C-029: a colour token in the default scope missing from the dark scope goes red', () => {
    const r = run('.css', light.replace('}', ';--ocx-color-light-only:#333}') + dark);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('--ocx-color-light-only');
  });

  it('C-029: the Starlight-only dark selector is still a dark scope', () => {
    const r = run('.css', ":root{--ocx-color-bg:#fff}:root[data-theme='dark']{--ocx-color-bg:#000;--ocx-color-x:#333}");
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('--ocx-color-x');
  });

  it('C-029: light-dark() tokens declared once in the default scope are skipped', () => {
    const r = run('.css', light.replace('}', ';--ocx-color-accent:light-dark(#e33,#f64)}') + dark);
    expect(r.stdout).toBe('');
    expect(r.status).toBe(0);
  });

  it('C-029: geometry/spacing tokens declared only in the default scope are allowlisted', () => {
    const r = run('.css', light.replace('}', ';--ocx-space-4:1rem;--ocx-z-modal:101}') + dark);
    expect(r.stdout).toBe('');
    expect(r.status).toBe(0);
  });

  it('C-029: zero paths is a FAIL, not a silent pass', () => {
    const r = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    expect(r.status).toBe(1);
  });

  it('C-029: an asymmetric inline <style> in .html goes red', () => {
    const r = run(
      '.html',
      `<html><head><style>${light}.dark,:root[data-theme=dark]{--ocx-color-bg:#000}</style></head></html>`,
    );
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('--ocx-color-fg');
  });

  it('C-029: a symmetric inline <style> in .html passes', () => {
    const r = run('.html', `<html><head><style>${light}${dark}</style></head><body></body></html>`);
    expect(r.stdout).toBe('');
    expect(r.status).toBe(0);
  });

  it('C-029: no owned colour token in any scope is a FAIL (no scope detected), not a pass', () => {
    const r = run('.css', ':root{--sl-color-bg:#fff}a{color:red}');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('no scope detected');
  });
});
