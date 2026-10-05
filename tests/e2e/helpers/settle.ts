import type { Page } from '@playwright/test';

/** Waits for running CSS transitions and animations (overlay enter/exit), so a probe reads final styles. */
// Infinite animations (a skeleton shimmer, a spinner) are skipped: their `finished` never resolves.
export const settle = (page: Page) =>
  page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
