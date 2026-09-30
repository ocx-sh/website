// Gate proof for `task lint`: type-aware oxlint goes red on a planted floating promise.
// The probe lives under scripts/ (non-dot dir) so it is inside tsconfig's include for type-aware rules.
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';

const root = new URL('..', import.meta.url).pathname;
const probeDir = new URL('tmp-oxlint-probe/', import.meta.url).pathname;
const oxc = new URL('bin/oxc.sh', import.meta.url).pathname;
afterAll(() => rmSync(probeDir, { recursive: true, force: true }));

const hasOxlint = spawnSync(oxc, ['oxlint', '--version']).status === 0;

describe('oxlint', () => {
  it('oxlint is resolvable in CI (the gate proof must not skip there)', () => {
    if (process.env.CI) expect(hasOxlint).toBe(true);
  });
  it.skipIf(!hasOxlint)(
    'fires no-floating-promises on a planted floating promise (skipped: oxlint not resolvable)',
    () => {
      mkdirSync(probeDir, { recursive: true });
      const probe = `${probeDir}probe.ts`;
      writeFileSync(probe, 'async function f(): Promise<void> {}\nf();\nexport {};\n');
      const r = spawnSync(oxc, ['oxlint', '--type-aware', probe], { cwd: root, encoding: 'utf8' });
      expect(r.status).not.toBe(0);
      expect(r.stdout + r.stderr).toContain('no-floating-promises');
    },
  );
});
