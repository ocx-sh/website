// The Toc probe (toc-probe.mjs): one pure function shared by the Zag Toc and, inlined via String(),
// by the Starlight TOC override.
import { describe, expect, it } from 'vitest';
import { probe } from '../src/components/toc-probe.mjs';

const H = 800;
// scroll-padding-top: a jump lands a heading here; the band (probe line mid-page) starts 8px lower.
const PAD = 92;
const BASE = PAD + 8;
// Headings at document offsets; viewport tops at scroll y are offset - y. `j`: the hash target.
const at = (offsets: number[], sh: number, y: number, j = -1) =>
  probe(
    offsets.map((o) => o - y),
    PAD,
    H,
    sh,
    y,
    j,
  );
// Where a jump to a heading at `offset` leaves the page: its offset less the padding, clamped.
const jump = (offset: number, sh: number) => Math.min(Math.max(offset - PAD, 0), sh - H);

describe('toc probe', () => {
  it('short page: nothing scrolls, the probe sits at the viewport bottom, the last visible heading wins', () => {
    expect(at([0, 300, 500], 700, 0)).toBe(2);
    expect(at([0, 300, 900], 700, 0)).toBe(1);
  });

  it('-1 when no heading has reached the probe', () => {
    expect(at([400, 900], 5000, 0)).toBe(-1);
  });

  it('long page, mid-scroll: the probe is the band top, 8px under the jump line', () => {
    const offsets = [0, 1000, 2000, 3000, 4000, 4700];
    expect(at(offsets, 5000, 1000 - BASE)).toBe(1);
    expect(at(offsets, 5000, 1000 - BASE - 2)).toBe(0);
    expect(at(offsets, 5000, 0)).toBe(0);
    expect(at(offsets, 5000, 2500)).toBe(2);
    // A heading reached through its link rests at the padding line, inside the band: it is active.
    expect(at(offsets, 5000, jump(2000, 5000))).toBe(2);
  });

  it('final stretch: several short trailing sections activate in order, one per step, none skipped', () => {
    const sh = 5000;
    const offsets = [0, 1000, 4300, 4400, 4500, 4600, 4700];
    const seen: number[] = [];
    for (let y = 0; y <= sh - H; y += 10) {
      const i = at(offsets, sh, y);
      if (seen.at(-1) !== i) seen.push(i);
    }
    expect(seen).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('exact bottom: the last heading', () => {
    expect(at([0, 1000, 4500, 4600, 4700, 4790], 5000, 5000 - H)).toBe(5);
  });

  it('overscroll and a missing heading (Infinity top) stay in range', () => {
    expect(at([0, 1000, 4700], 5000, 9999)).toBe(2);
    expect(probe([0, Infinity], PAD, H, 5000, 4200, -1)).toBe(0);
    expect(probe([], PAD, H, 5000, 4200, -1)).toBe(-1);
  });
});

describe('toc probe: jump rule (the hash target)', () => {
  const sh = 5000;
  const offsets = [0, 1000, 3900, 4000, 4300, 4400, 4500, 4600, 4700];

  it('every entry, jumped to, is the active one: mid-page, in the final screen and at the bottom', () => {
    offsets.forEach((o, j) => expect(at(offsets, sh, jump(o, sh), j), `jump to #${j}`).toBe(j));
  });

  it('in the final screen the probe alone would pick a later heading; the jump target wins', () => {
    // 3900 lands at the padding line with the probe already slid down; 4300 lands at the bottom.
    expect(at(offsets, sh, jump(3900, sh))).toBeGreaterThan(2);
    expect(at(offsets, sh, jump(3900, sh), 2)).toBe(2);
    expect(at(offsets, sh, jump(4300, sh))).toBe(8);
    expect(at(offsets, sh, jump(4300, sh), 4)).toBe(4);
  });

  it('a short section: a jump target 5px above the next heading stays active', () => {
    const close = [0, 1000, 1005, 2000];
    expect(at(close, 5000, jump(1000, 5000))).toBe(2);
    expect(at(close, 5000, jump(1000, 5000), 1)).toBe(1);
  });

  it('holds within 2px of the landing offset; a scroll that moves the heading further hands back to the probe', () => {
    const y = jump(3900, sh);
    expect(at(offsets, sh, y + 2, 2)).toBe(2);
    expect(at(offsets, sh, y - 3, 2)).toBe(at(offsets, sh, y - 3));
    expect(at(offsets, sh, y + 50, 2)).toBe(at(offsets, sh, y + 50));
    // At the bottom (4300 landed there), scrolling up hands back too.
    expect(at(offsets, sh, sh - H - 10, 4)).toBe(at(offsets, sh, sh - H - 10));
  });

  it('no hash target (-1), or an index past the list, leaves the probe alone', () => {
    expect(probe([0, 500], PAD, H, 5000, 408, -1)).toBe(probe([0, 500], PAD, H, 5000, 408, 5));
  });
});
