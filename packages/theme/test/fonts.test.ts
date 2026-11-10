// The generated Plex core/rest subsets: in sync with the pinned fontsource files, disjoint, complete and small.
// Rerun the generator with `pnpm --filter @ocx-sh/theme fonts` when this goes red.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import wawoff2 from 'wawoff2';
import { describe, expect, it } from 'vitest';
import { cmapCodepoints, emptyOutlineCodepoints, layoutFeatures, nameIds } from '../scripts/sfnt.mjs';
import { CORE_RANGE, FILES, REST_RANGE, SOURCES } from '../src/fonts/plex.generated.mjs';

const require = createRequire(import.meta.url);
const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const FONTS = join(SRC, 'fonts');
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const read = (f: string) => readFileSync(join(FONTS, f));
const unwoff = async (b: Buffer) => Buffer.from(await wawoff2.decompress(b));
const parseRange = (r: string) =>
  r.split(',').flatMap((part) => {
    const [a, b = a] = part
      .replace(/U\+/g, '')
      .split('-')
      .map((h) => parseInt(h, 16));
    return Array.from({ length: b! - a! + 1 }, (_, i) => a! + i);
  });
const excluded = (c: number) => c <= 0x1f || (c >= 0x7f && c <= 0x9f) || c === 0xffff;
const sourcePath = (name: string) => {
  const family = name.includes('-sans-') ? 'sans' : 'mono';
  return join(dirname(require.resolve(`@fontsource/ibm-plex-${family}/package.json`)), 'files', name);
};
const faces = ['sans', 'mono'].flatMap((f) =>
  [400, 600].map((w) => ({ f, w, src: `ibm-plex-${f}-latin-${w}-normal.woff2` })),
);

describe('generated Plex fonts', () => {
  it('every pinned source file matches the recorded hash', () => {
    expect(Object.keys(SOURCES)).toHaveLength(4);
    for (const [name, hash] of Object.entries(SOURCES)) expect(sha(readFileSync(sourcePath(name)))).toBe(hash);
  });

  it('every committed output matches the recorded hash and size (stale files fail)', () => {
    expect(Object.keys(FILES)).toHaveLength(8);
    for (const [name, { bytes, sha256 }] of Object.entries(FILES)) {
      const b = read(name);
      expect(b.length, name).toBe(bytes);
      expect(sha(b), name).toBe(sha256);
    }
  });

  it('the four core files stay under 39,500 B in total', () => {
    const total = Object.entries(FILES)
      .filter(([n]) => n.endsWith('-core.woff2'))
      .reduce((s, [, f]) => s + f.bytes, 0);
    expect(total).toBeLessThanOrEqual(39_500);
  });

  it('core and rest ranges are disjoint', () => {
    const core = new Set(parseRange(CORE_RANGE));
    expect(parseRange(REST_RANGE).filter((c) => core.has(c))).toEqual([]);
  });

  it.each(faces)(
    '$f $w: core ∪ rest is the source cmap minus controls, and the files cover their ranges',
    async ({ f, w, src }) => {
      const all = cmapCodepoints(await unwoff(readFileSync(sourcePath(src)))).filter((c) => !excluded(c));
      const core = cmapCodepoints(await unwoff(read(`plex-${f}-${w}-core.woff2`)));
      const rest = cmapCodepoints(await unwoff(read(`plex-${f}-${w}-rest.woff2`)));
      expect(core.filter((c) => rest.includes(c))).toEqual([]);
      expect([...core, ...rest].sort((a, b) => a - b)).toEqual(all);
      const [coreRange, restRange] = [new Set(parseRange(CORE_RANGE)), new Set(parseRange(REST_RANGE))];
      expect(core.every((c) => coreRange.has(c))).toBe(true);
      expect(rest.every((c) => restRange.has(c))).toBe(true);
    },
  );

  it('no REST_RANGE codepoint is blank in every face that maps it (a blank glyph is core)', async () => {
    // wawoff2 shares one WASM heap: decompress one file at a time.
    const all: Buffer[] = [];
    for (const { f, w } of faces)
      for (const p of ['core', 'rest']) all.push(await unwoff(read(`plex-${f}-${w}-${p}.woff2`)));
    const mapped = all.map((b) => new Set(cmapCodepoints(b)));
    const blank = all.map((b) => new Set(emptyOutlineCodepoints(b)));
    expect(blank.some((s) => s.has(0x20))).toBe(true); // the probe sees blanks at all
    const bad = parseRange(REST_RANGE).filter((c) => mapped.every((m, i) => !m.has(c) || blank[i]?.has(c)));
    expect(bad).toEqual([]);
  });

  // Dropped on purpose: frac, dnom, numr add 8.8 KB to the core; ccmp and mark have no core glyph to act on.
  const DROPPED = new Set(['ccmp', 'mark', 'frac', 'dnom', 'numr']);
  it.each(faces)(
    '$f $w: the core keeps every layout feature of the source but the ones dropped on purpose',
    async ({ f, w, src }) => {
      const want = [...layoutFeatures(await unwoff(readFileSync(sourcePath(src))))]
        .filter((t) => !DROPPED.has(t))
        .sort();
      const have = layoutFeatures(await unwoff(read(`plex-${f}-${w}-core.woff2`)));
      expect(want.filter((t) => !have.has(t))).toEqual([]);
    },
  );

  it('the declared ranges are exactly the union of the faces', async () => {
    const coreAll = new Set<number>();
    const restAll = new Set<number>();
    for (const { f, w } of faces) {
      cmapCodepoints(await unwoff(read(`plex-${f}-${w}-core.woff2`))).forEach((c) => coreAll.add(c));
      cmapCodepoints(await unwoff(read(`plex-${f}-${w}-rest.woff2`))).forEach((c) => restAll.add(c));
    }
    expect(parseRange(CORE_RANGE).sort((a, b) => a - b)).toEqual([...coreAll].sort((a, b) => a - b));
    expect(parseRange(REST_RANGE).sort((a, b) => a - b)).toEqual([...restAll].sort((a, b) => a - b));
  });

  it.each(Object.keys(FILES))('%s keeps the copyright, family and licence name records', async (name) => {
    const ids = nameIds(await unwoff(read(name)));
    for (const id of [0, 1, 14]) expect(ids.has(id), `name ID ${id}`).toBe(true);
  });

  it('rest.css and fonts.css reference only existing generated files and carry the generated ranges', () => {
    const rest = readFileSync(join(FONTS, 'rest.css'), 'utf8');
    const shell = readFileSync(join(SRC, 'fonts.css'), 'utf8');
    for (const [css, dir, part, range, family] of [
      [rest, FONTS, 'rest', REST_RANGE, 'OCX Plex'],
      [shell, SRC, 'core', CORE_RANGE, 'IBM Plex'],
    ] as const) {
      const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1]!);
      expect(urls).toHaveLength(4);
      for (const u of urls) {
        expect(u).toMatch(new RegExp(`plex-(sans|mono)-(400|600)-${part}\\.woff2$`));
        expect(existsSync(join(dir, u)), u).toBe(true);
      }
      const ranges = [...css.matchAll(/unicode-range: ([^;]+);/g)].map((m) => m[1]);
      expect(ranges).toEqual(Array(4).fill(range));
      expect(css.match(new RegExp(`font-family: '${family} (Sans|Mono)( Rest)?'`, 'g'))).toHaveLength(4);
    }
    expect(shell).toContain("@import './fonts/rest.css';");
  });
});
