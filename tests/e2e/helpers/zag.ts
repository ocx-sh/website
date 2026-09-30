// Shared by the Z1 gates (C-112, C-113): which Zag roots load on which
// trigger, and how a spec touches one the way a reader would.
import type { Locator, Page } from '@playwright/test';

export const ZAG_ROOT = '[data-zag-root]';
// D-Z11: interaction is the default trigger; a root that loads on `visible` or
// `manual` says so in `data-zag-trigger`.
export const INTERACTION_ROOT = `${ZAG_ROOT}:not([data-zag-trigger]), ${ZAG_ROOT}[data-zag-trigger="interaction"]`;
export const MANUAL_ROOT = `${ZAG_ROOT}[data-zag-trigger="manual"]`;

/**
 * Stable handles on the roots matching `selector` now: each is tagged with an
 * index first, so a root that mounts another root cannot shift the list.
 */
export async function tagRoots(page: Page, selector: string, tag: string): Promise<Locator[]> {
  const n = await page
    .locator(selector)
    .evaluateAll((els, t) => els.map((e, i) => e.setAttribute(`data-gate-${t}`, String(i))).length, tag);
  return Array.from({ length: n }, (_, i) => page.locator(`[data-gate-${tag}="${i}"]`));
}

/**
 * Touch a root: scroll it into view (`visible`), then a real hover and/or a
 * focus of its first enabled focusable part (`interaction`). A hidden root gets a
 * dispatched `pointerenter` instead of a real hover, and a root whose parts take no focus
 * (disabled, hidden) a dispatched `focusin`.
 */
export async function activate(root: Locator, how: 'hover' | 'focus' | 'both' = 'both'): Promise<void> {
  await root.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  if (how !== 'focus') {
    if (await root.isVisible()) await root.hover();
    else await root.dispatchEvent('pointerenter');
  }
  if (how !== 'hover') {
    await root.evaluate((el) => {
      const target = el.querySelector<HTMLElement>(
        ':is(a[href], button, input, select, textarea, [tabindex]):not(:disabled, [tabindex="-1"])',
      );
      target?.focus();
      // A disabled or hidden control takes no focus; a dispatched focusin still proves the trigger.
      if (!target || document.activeElement !== target) el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    });
  }
}

/**
 * Give a `manual` root its outside start signal (D-Z11): an `ocx:toast` for
 * the toaster, an `ocx:dialog:open` for a trigger-less dialog, a click on its
 * first button for search (a dialog root with a real trigger) and the mobile
 * toggle, then Escape to close whatever opened. Returns false for a root that is not
 * rendered at this viewport (the mobile toggle on desktop).
 */
export async function startManual(page: Page, root: Locator): Promise<boolean> {
  await page.evaluate(() =>
    document.dispatchEvent(new CustomEvent('ocx:toast', { detail: { title: 'budget probe' }, bubbles: true })),
  );
  // A trigger-less Dialog preset (ConfirmDialog, AlertDialog) opens only by `ocx:dialog:open {id}`.
  // Search is a dialog root too, but has a trigger part and ignores that event.
  if (
    (await root.getAttribute('data-zag-root')) === 'dialog' &&
    (await root.locator('[data-part="trigger"]').count()) === 0
  ) {
    await root.evaluate((el) =>
      document.dispatchEvent(new CustomEvent('ocx:dialog:open', { detail: { id: el.getAttribute('data-zag-id') } })),
    );
    await root.locator('[data-part="content"]').waitFor();
    await page.keyboard.press('Escape');
    return true;
  }
  const button = root.locator('button').first();
  if (await button.isVisible()) {
    await button.click();
    // The click opens only once the machine is live: an Escape before that is lost and the
    // dialog or drawer stays open, so a later Ctrl/⌘K would close it instead.
    await root.locator('button[aria-expanded="true"]').first().waitFor();
    await page.keyboard.press('Escape');
  }
  return root.evaluate((el) => el.checkVisibility() || el.getAttribute('data-zag-state') !== 'idle');
}
