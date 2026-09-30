// C-071: require-dist.mjs fails on a missing dist, and the `css` target calls it with every app dist on disk.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const root = new URL('..', import.meta.url).pathname;
const script = new URL('require-dist.mjs', import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'require-dist-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function run(...args: string[]) {
  return runIn(undefined, ...args);
}
function runIn(cwd: string | undefined, ...args: string[]) {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', cwd });
  return { status: r.status, out: r.stdout + r.stderr };
}

const present = join(dir, 'present');
mkdirSync(join(present, 'sub'), { recursive: true });
writeFileSync(join(present, 'sub', 'index.html'), '');

describe('require-dist.mjs', () => {
  it('C-071: a missing dir exits 1 with `missing dist: <dir>`', () => {
    const missing = join(dir, 'absent');
    const r = run(missing);
    expect(r.status).toBe(1);
    expect(r.out).toContain(`missing dist: ${missing}`);
  });

  it('C-071: all dirs present exits 0', () => {
    expect(run(present).status).toBe(0);
  });

  it('C-071: zero args is a FAIL, not a silent pass', () => {
    expect(run().status).toBe(1);
  });

  it('C-071: mixed present/missing reports each missing dir', () => {
    const [a, b] = [join(dir, 'a'), join(dir, 'b')];
    const r = run(a, present, b);
    expect(r.status).toBe(1);
    expect(r.out).toContain(`missing dist: ${a}`);
    expect(r.out).toContain(`missing dist: ${b}`);
    expect(r.out).not.toContain(`missing dist: ${present}`);
  });

  it('C-071: a regular file named like the dir is `missing dist`', () => {
    const file = join(dir, 'file-dist');
    writeFileSync(file, '');
    const r = run(file);
    expect(r.status).toBe(1);
    expect(r.out).toContain(`missing dist: ${file}`);
  });

  it('C-071: a dir with no .css/.html below it exits 1 with `empty dist: <dir>`', () => {
    const empty = join(dir, 'empty');
    mkdirSync(join(empty, 'assets'), { recursive: true });
    writeFileSync(join(empty, 'assets', 'x.js'), '');
    const r = run(empty);
    expect(r.status).toBe(1);
    expect(r.out).toContain(`empty dist: ${empty}`);
  });

  it.each(['app/astro.config.mjs', 'app/public/logo.svg', 'packages/theme/package.json', 'pnpm-lock.yaml'])(
    'C-071: %s newer than the dist is `stale dist`',
    (input) => {
      const repo = mkdtempSync(join(dir, 'repo-'));
      const dist = join(repo, 'app', 'dist');
      mkdirSync(dist, { recursive: true });
      writeFileSync(join(dist, 'index.html'), '');
      const old = new Date(Date.now() - 60_000);
      utimesSync(join(dist, 'index.html'), old, old);
      expect(runIn(repo, 'app/dist').status).toBe(0);
      mkdirSync(join(repo, input, '..'), { recursive: true });
      writeFileSync(join(repo, input), '');
      const r = runIn(repo, 'app/dist');
      expect(r.status).toBe(1);
      expect(r.out).toContain('stale dist: app/dist');
    },
  );

  const hasTask = !spawnSync('task', ['--version']).error;
  it('C-071: task is on PATH in CI (the `css` wiring test must not skip there)', () => {
    if (process.env.CI) expect(hasTask).toBe(true);
  });
  it.skipIf(!hasTask)(
    'C-071: `css` runs require-dist first over every app dist on disk (skipped: task not on PATH)',
    () => {
      const apps = readdirSync(join(root, 'examples'))
        .map((d) => `examples/${d}`)
        .concat('site')
        .filter((d) => existsSync(join(root, d, 'package.json')));
      const r = spawnSync('task', ['--dry', 'css'], { cwd: root, encoding: 'utf8' });
      expect(r.status).toBe(0);
      const first = (r.stdout + r.stderr).split('\n').find((l) => l.startsWith('task: [css] '));
      expect(first?.slice('task: [css] '.length).trim().split(/\s+/)).toEqual([
        'node',
        'scripts/require-dist.mjs',
        ...apps.map((a) => `${a}/dist`),
      ]);
      expect(apps).toContain('examples/starlight');
    },
  );

  function firstCommand(task: string, r: { stdout: string; stderr: string }) {
    const prefix = `task: [${task}] `;
    return (r.stdout + r.stderr)
      .split('\n')
      .find((l) => l.startsWith(prefix))
      ?.slice(prefix.length)
      .trim()
      .split(/\s+/);
  }

  it.skipIf(!hasTask)(
    'C-071: `e2e` runs require-dist first over every app dist on disk (skipped: task not on PATH)',
    () => {
      const apps = readdirSync(join(root, 'examples'))
        .map((d) => `examples/${d}`)
        .concat('site')
        .filter((d) => existsSync(join(root, d, 'package.json')));
      const r = spawnSync('task', ['--dry', 'e2e'], { cwd: root, encoding: 'utf8' });
      expect(r.status).toBe(0);
      expect(firstCommand('e2e', r)).toEqual(['node', 'scripts/require-dist.mjs', ...apps.map((a) => `${a}/dist`)]);
    },
  );

  it.skipIf(!hasTask)(
    'C-071: `lighthouse` runs require-dist first over every app dist on disk (skipped: task not on PATH)',
    () => {
      const apps = readdirSync(join(root, 'examples'))
        .map((d) => `examples/${d}`)
        .concat('site')
        .filter((d) => existsSync(join(root, d, 'package.json')));
      const r = spawnSync('task', ['--dry', 'lighthouse'], { cwd: root, encoding: 'utf8' });
      expect(r.status).toBe(0);
      expect(firstCommand('lighthouse', r)).toEqual([
        'node',
        'scripts/require-dist.mjs',
        ...apps.map((a) => `${a}/dist`),
      ]);
    },
  );
});
