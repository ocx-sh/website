// inlined-sheets.mjs goes red on an external `_astro/Skeleton.*.css` (or ShellSession) and stays green otherwise.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const script = new URL('inlined-sheets.mjs', import.meta.url).pathname;
const tmp = mkdtempSync(join(tmpdir(), 'inlined-sheets-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

let n = 0;
function run(...sheets: string[]) {
  const dist = join(tmp, `d${n++}`);
  mkdirSync(join(dist, '_astro'), { recursive: true });
  for (const f of sheets) writeFileSync(join(dist, '_astro', f), '');
  return spawnSync(process.execPath, [script, dist], { encoding: 'utf8' });
}

describe('inlined-sheets.mjs', () => {
  it('passes a dist whose other component sheets are external', () => {
    const r = run('Tabs.abc123.css', 'SkeletonLike.abc123.css', 'index.abc123.js');
    expect(r.stdout).toBe('');
    expect(r.status).toBe(0);
  });

  it.each(['Skeleton.Dk3_a-9.css', 'ShellSession.Dk3_a-9.css'])('fails on an external %s', (sheet) => {
    const r = run('Tabs.abc123.css', sheet);
    expect(r.stdout).toContain(sheet);
    expect(r.status).toBe(1);
  });

  it('fails with no dist given', () => {
    expect(spawnSync(process.execPath, [script], { encoding: 'utf8' }).status).toBe(1);
  });
});
