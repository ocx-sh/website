// The scroll maths: easing, the pinned stage timeline, reveals, the fade.
import { describe, expect, it } from 'vitest';
import { cardAt, ease, finalAt, flyDistance, heroFade, pinProgress, revealAt } from '../src/components/ui/scroll.mjs';

describe('scroll maths', () => {
  it('ease clamps its input and runs 0 to 1 with easeOutCubic', () => {
    expect(ease(-3)).toBe(0);
    expect(ease(9)).toBe(1);
    expect(ease(0.5)).toBeCloseTo(0.875, 6);
  });

  it('pinProgress is 0 before the section sticks, 1 when its end reaches the stage, linear between', () => {
    // 54px sticky top, 800px viewport, 1700px section.
    expect(pinProgress(54, 1700, 800, 54)).toBe(0);
    expect(pinProgress(300, 1700, 800, 54)).toBe(0);
    expect(pinProgress(54 - 954, 1700, 800, 54)).toBe(1);
    expect(pinProgress(54 - 477, 1700, 800, 54)).toBeCloseTo(0.5, 6);
  });

  it('items enter in pairs 0.06 apart, and strike after 0.42 one by one', () => {
    expect(cardAt(0, 0)).toEqual({ e: 0, s: 0 });
    expect(cardAt(0.22, 0).e).toBe(1);
    // The second pair has not started where the first is half in.
    expect(cardAt(0.06, 2).e).toBe(0);
    expect(cardAt(0.11, 0).e).toBeGreaterThan(0.8);
    expect(cardAt(0.41, 5).s).toBe(0);
    expect(cardAt(1, 5)).toEqual({ e: 1, s: 1 });
    // Same pair, same entry; the strike staggers by index.
    expect(cardAt(0.3, 0).e).toBe(cardAt(0.3, 1).e);
    expect(cardAt(0.5, 0).s).toBeGreaterThan(cardAt(0.5, 3).s);
  });

  it('the finale starts at 0.68 and is whole at 0.86', () => {
    expect(finalAt(0.68)).toBe(0);
    expect(finalAt(0.86)).toBe(1);
  });

  it('a block reveals over 260px once it is 80px inside the viewport', () => {
    expect(revealAt(800, 800)).toBe(0);
    expect(revealAt(720, 800)).toBe(0);
    expect(revealAt(460, 800)).toBe(1);
  });

  it('a fade is gone after 0.55 of a viewport, and items fly at most half the viewport', () => {
    expect(heroFade(0, 800)).toBe(1);
    expect(heroFade(440, 800)).toBeCloseTo(0, 9);
    expect(flyDistance(375)).toBe(187.5);
    expect(flyDistance(1920)).toBe(420);
  });
});
