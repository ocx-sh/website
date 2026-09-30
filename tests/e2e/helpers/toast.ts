// Toast timing, shared by toast.spec.ts and zag-copy.spec.ts.
import type { Page } from '@playwright/test';

/**
 * How long a toast dispatched with `detail` stays open, in ms, timed in the page (first open frame
 * to its close) so test-runner latency cannot blur it. The pointer stays off the region (no pause).
 */
export const lifetime = (page: Page, detail: Record<string, unknown>) =>
  page.evaluate(
    (d) =>
      new Promise<number>((resolve) => {
        let start = 0;
        const frame = () => {
          const open = document.querySelector('[data-zag-root="toast"] [data-part="root"][data-state="open"]');
          if (open && !start) start = performance.now();
          if (start && !open) return resolve(performance.now() - start);
          requestAnimationFrame(frame);
        };
        document.dispatchEvent(new CustomEvent('ocx:toast', { detail: d, bubbles: true }));
        frame();
      }),
    detail,
  );
