// scripts/lighthouse.mjs: the cache key covers a page's HTML and every local file it pulls in
// (and nothing else); the lane pool and the memory clamp.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DEFAULT_LANES, HEADROOM_BYTES, LANE_BYTES, laneCount, pageKey, pool } from './lighthouse.mjs';

const root = mkdtempSync(join(tmpdir(), 'lh-key-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const put = (path: string, body: string) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), body);
};

put(
  'docs/p/index.html',
  '<link rel="stylesheet" href="/docs/_astro/a.css"><script type="module" src="/docs/_astro/m.js"></script>' +
    '<img src="../img.png" width="1" height="1"><a href="/docs/404.html">404</a><a href="/docs/q/">q</a>',
);
put('docs/_astro/a.css', '@font-face{src:url(./f.woff2)}');
put('docs/_astro/f.woff2', 'font');
put('docs/_astro/m.js', 'import"./c.js";const u=`/docs/_astro/lazy.js`;');
put('docs/_astro/c.js', 'chunk');
put('docs/_astro/lazy.js', 'lazy');
put('docs/img.png', 'png');
put('docs/404.html', 'other page');
put('docs/q/index.html', 'other page');
put('docs/_astro/unrelated.css', 'x{}');

const key = () => pageKey(root, '/docs/p/', 'salt');

describe('pageKey', () => {
  it.each(['docs/_astro/f.woff2', 'docs/_astro/c.js', 'docs/_astro/lazy.js', 'docs/img.png', 'docs/_astro/a.css'])(
    'changes when %s changes',
    (path) => {
      const was = key();
      put(path, `changed ${path} @font-face{src:url(./f.woff2)}`);
      expect(key()).not.toBe(was);
    },
  );

  it('ignores files the page does not reference, other pages included', () => {
    const was = key();
    for (const path of ['docs/_astro/unrelated.css', 'docs/404.html', 'docs/q/index.html']) put(path, 'changed');
    expect(key()).toBe(was);
  });

  it('changes with the salt and with the page itself', () => {
    const was = key();
    expect(pageKey(root, '/docs/p/', 'other')).not.toBe(was);
    put('docs/p/index.html', 'changed');
    expect(key()).not.toBe(was);
  });
});

describe('pool', () => {
  it('runs every item once on at most n lanes, results in item order', async () => {
    let running = 0;
    let peak = 0;
    const lanes = new Set<number>();
    const items = Array.from({ length: 10 }, (_, i) => i);
    const out = await pool(items, 3, async (item, lane) => {
      lanes.add(lane);
      peak = Math.max(peak, ++running);
      await new Promise((r) => setTimeout(r, (item % 3) * 5));
      running--;
      return item * 2;
    });
    expect(out).toEqual(items.map((i) => i * 2));
    expect(peak).toBe(3);
    expect([...lanes].sort((a, b) => a - b)).toEqual([0, 1, 2]);
  });

  it('starts no more lanes than items', async () => {
    const lanes = new Set<number>();
    await pool(['a'], 4, (_, lane) => Promise.resolve(lanes.add(lane)));
    expect([...lanes]).toEqual([0]);
  });
});

describe('laneCount', () => {
  const room = (lanes: number) => HEADROOM_BYTES + lanes * LANE_BYTES;
  it('takes the request when memory allows', () => expect(laneCount(5, room(8))).toBe(5));
  it('falls back to the default for a missing request', () => expect(laneCount(NaN, room(8))).toBe(DEFAULT_LANES));
  it('clamps to the lanes that fit above the headroom', () => expect(laneCount(5, room(2) + 1)).toBe(2));
  it('keeps one lane on a starved host', () => expect(laneCount(5, 0)).toBe(1));
});
