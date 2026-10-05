// "A fresh load animates nothing" without racing the first frame. On a starved host `load` can come
// before the first frame, and controls then fade from their pre-sheet colours inside it (seen ~1 in
// 500 loads: running at t = 0, gone 150 ms later). Those start before the first frame; a probe
// must fail for what starts after it, so it waits for the first frame and for what that frame
// started to finish, and counts every animation event from there on.
import type { Page } from '@playwright/test';

/** Before `page.goto`: records the `transitionrun`/`animationstart` events of elements under `scope` (on it alone, `self`). */
export const watchStarts = (page: Page, scope: string, self = false) =>
  page.addInitScript(
    ([sel, only]) => {
      const started: string[] = [];
      for (const type of ['transitionrun', 'animationstart'])
        document.addEventListener(
          type,
          (e) => {
            const el = e.target as Element;
            if (only ? el.matches(sel) : el.closest(sel))
              started.push(`${type} ${(e as TransitionEvent).propertyName ?? ''} ${el.localName}`);
          },
          true,
        );
      Object.assign(window, { started });
    },
    [scope, self] as const,
  );

/** After `page.goto`: waits out the first frame and its animations; returns what started later. */
export const startsAfterFirstFrame = (page: Page) =>
  page.evaluate(async () => {
    const started = (window as unknown as { started: string[] }).started;
    const frame = () => new Promise((done) => requestAnimationFrame(done));
    await document.fonts.ready;
    await frame(); // its animation events are out, and what it started is running
    const early = started.length;
    // An infinite animation (a spinner) never finishes; the probe's own `animating` check judges it.
    const finite = document.getAnimations().filter((a) => a.effect?.getComputedTiming().endTime !== Infinity);
    await Promise.all(finite.map((a) => a.finished.catch(() => undefined)));
    await frame();
    await frame();
    return started.slice(early);
  });
