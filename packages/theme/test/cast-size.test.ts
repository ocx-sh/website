// cast-size.mjs: the terminal size Terminal.astro reserves, read from a cast's header line.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { castSize, publicCastSize } from '../src/components/cast-size.mjs';

describe('castSize', () => {
  it('reads asciicast v3 term.cols/rows and v2 width/height', () => {
    expect(castSize('{"version":3,"term":{"cols":100,"rows":19}}')).toEqual({ cols: 100, rows: 19 });
    expect(castSize('{"version": 2, "width": 80, "height": 24}')).toEqual({ cols: 80, rows: 24 });
  });

  it('returns undefined for anything else', () => {
    for (const bad of [
      '',
      'not json',
      '[0.1,"o","x"]',
      'null',
      '{"width":80}',
      '{"term":{"cols":0,"rows":5}}',
      '{"width":"80","height":24}',
    ])
      expect(castSize(bad), bad).toBeUndefined();
  });
});

describe('publicCastSize', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cast-size-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'casts'));
  writeFileSync(join(dir, 'casts', 'a.cast'), '{"version":3,"term":{"cols":90,"rows":12}}\n[0.1,"o","x"]\n');

  it('reads a root-relative src under the public dir, given as a path or a URL', () => {
    expect(publicCastSize('/casts/a.cast', dir)).toEqual({ cols: 90, rows: 12 });
    expect(publicCastSize('/casts/a.cast', new URL(`file://${dir}/`))).toEqual({ cols: 90, rows: 12 });
  });

  it('is undefined for a missing file, a relative path or a remote URL', () => {
    expect(publicCastSize('/casts/missing.cast', dir)).toBeUndefined();
    expect(publicCastSize('casts/a.cast', dir)).toBeUndefined();
    expect(publicCastSize('//cdn.example/a.cast', dir)).toBeUndefined();
  });
});
