// The build lock and the freshness stamp that let one vitest run share a single `site/dist` build.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { acquireLock, isFresh } from './build-site.ts';

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'build-site-test-'));
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe('acquireLock', () => {
  it('takes a free lock and records its pid', async () => {
    const lock = join(tmp, 'l.lock');
    await acquireLock(lock);
    expect(existsSync(join(lock, 'pid'))).toBe(true);
  });

  it('breaks a lock whose owner is dead by renaming it away, leaving no stale directory', async () => {
    const lock = join(tmp, 'l.lock');
    mkdirSync(lock);
    writeFileSync(join(lock, 'pid'), '2147483646'); // no such process
    await acquireLock(lock);
    expect(readdirSync(tmp)).toEqual(['l.lock']);
    expect(readdirSync(lock)).toEqual(['pid']);
  });

  it('throws on a mkdir error other than EEXIST instead of spinning', async () => {
    await expect(acquireLock(join(tmp, 'missing-parent', 'l.lock'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('waits for a live owner and does not steal its lock', async () => {
    const lock = join(tmp, 'l.lock');
    mkdirSync(lock);
    writeFileSync(join(lock, 'pid'), String(process.pid));
    const taken = acquireLock(lock, 60_000, 10);
    const outcome = await Promise.race([taken.then(() => 'taken'), new Promise((r) => setTimeout(r, 100, 'waiting'))]);
    expect(outcome).toBe('waiting');
    rmSync(lock, { recursive: true });
    await taken;
  });
});

describe('isFresh', () => {
  const setup = () => {
    const stamp = join(tmp, 'stamp');
    const input = join(tmp, 'input.txt');
    const index = join(tmp, 'index.html');
    writeFileSync(input, 'x');
    writeFileSync(index, 'x');
    utimesSync(input, 1, 1);
    return { stamp, input, index, fresh: () => isFresh(stamp, [input], index) };
  };

  it('is stale without a stamp, fresh once the stamp postdates every input, stale after an edit or a missing dist', () => {
    const { stamp, input, index, fresh } = setup();
    expect(fresh()).toBe(false);
    writeFileSync(stamp, String(Date.now()));
    expect(fresh()).toBe(true);
    utimesSync(input, Date.now() / 1000 + 5, Date.now() / 1000 + 5);
    expect(fresh()).toBe(false);
    utimesSync(input, 1, 1);
    expect(fresh()).toBe(true);
    rmSync(index);
    expect(fresh()).toBe(false);
  });
});
