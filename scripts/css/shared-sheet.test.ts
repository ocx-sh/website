// shared-sheet.mjs goes red when the sheets every page loads outgrow SHARED_SHEET_GZ and stays green below it.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { SHARED_SHEET_GZ } from '../../tests/budgets.mjs';
import { blockingSheets } from './shared-sheet.mjs';

const script = new URL('shared-sheet.mjs', import.meta.url).pathname;
const tmp = mkdtempSync(join(tmpdir(), 'shared-sheet-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const page = (...hrefs: string[]) =>
  `<html><head>${hrefs.map((h) => `<link rel="stylesheet" href="${h}"${h.includes('print') ? ' media="print"' : ''}>`).join('')}</head></html>`;
let n = 0;
/** A Starlight-shaped dist whose blocking sheets weigh about `bytes` (random bytes do not compress). */
function starlight(bytes: number, ec = 50_000) {
  const dist = join(tmp, `d${n++}`);
  mkdirSync(join(dist, 'probe', 'long'), { recursive: true });
  mkdirSync(join(dist, '_astro'));
  writeFileSync(join(dist, '_astro', 'common.a.css'), randomBytes(bytes));
  writeFileSync(join(dist, '_astro', 'ec.a.css'), randomBytes(ec));
  writeFileSync(join(dist, '_astro', 'print.a.css'), randomBytes(5_000));
  writeFileSync(
    join(dist, 'probe', 'long', 'index.html'),
    page('/docs/_astro/print.a.css', '/docs/_astro/common.a.css', '/docs/_astro/ec.a.css'),
  );
  return dist;
}
const run = (...dists: string[]) => spawnSync(process.execPath, [script, ...dists], { encoding: 'utf8' });

describe('shared-sheet.mjs', () => {
  it('lists blocking sheets only, not print sheets', () => {
    expect(blockingSheets(page('/a/print.css', '/a/b.css'))).toEqual(['/a/b.css']);
  });

  it('passes under the ceiling and ignores Expressive Code and print sheets', () => {
    const r = run(starlight(SHARED_SHEET_GZ.starlight - 2_000));
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('common.a.css');
    expect(r.stdout).not.toContain('ec.a.css');
  });

  it('fails past the ceiling and says what to do', () => {
    const r = run(starlight(SHARED_SHEET_GZ.starlight + 2_000));
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/Move rules into the sheet of the component/);
    expect(r.stdout).toMatch(/SHARED_SHEET_GZ/);
  });

  it('measures the root site on the sheets / and /team/ share', () => {
    const dist = join(tmp, `d${n++}`);
    mkdirSync(join(dist, 'team'), { recursive: true });
    mkdirSync(join(dist, '_astro'));
    writeFileSync(join(dist, '_astro', 'common.s.css'), randomBytes(SHARED_SHEET_GZ.site + 2_000));
    writeFileSync(join(dist, '_astro', 'team.s.css'), randomBytes(100));
    writeFileSync(join(dist, 'index.html'), page('/_astro/common.s.css'));
    writeFileSync(join(dist, 'team', 'index.html'), page('/_astro/common.s.css', '/_astro/team.s.css'));
    const r = run(dist);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('common.s.css');
    expect(r.stdout).not.toContain('team.s.css');
  });

  it('fails with no dist given', () => {
    expect(spawnSync(process.execPath, [script], { encoding: 'utf8' }).status).toBe(1);
  });
});
