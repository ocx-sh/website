import type { Page } from '@playwright/test';

/**
 * Waits until the showcase event log is recording. It installs lazily (first input or idle after
 * load) and an `ocx:*` event dispatched earlier is not listed, so a spec that asserts the log
 * after a key press on an instant emitter (CycleButton, ToggleButton, SearchField) waits first.
 */
export const logReady = (page: Page) =>
  page.locator('[data-showcase-log][data-ready]').first().waitFor({ state: 'attached' });
