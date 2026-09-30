import type { Page } from '@playwright/test';

/** Waits for running CSS transitions and animations (overlay enter/exit), so a probe reads final styles. */
export const settle = (page: Page) =>
  page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
