// Token resolution for computed-style e2e checks: never hardcode px, resolve the token in the page.
import type { Locator, Page } from '@playwright/test';

/** Set `prop: value` (a token expression) on a probe in <body>, read computed `read` (default `prop`). */
export const resolve = (page: Page, prop: string, value: string, read = prop) =>
  page.evaluate(
    ([p, v, r]) => {
      const probe = document.createElement('div');
      probe.style.setProperty(p, v);
      document.body.append(probe);
      const out = getComputedStyle(probe).getPropertyValue(r);
      probe.remove();
      return out;
    },
    [prop, value, read] as const,
  );

/** Rendered border-box block size of a token expression, in px. */
export const resolveBlockSize = (page: Page, value: string) =>
  page.evaluate((v) => {
    const probe = document.createElement('div');
    probe.style.cssText = `display:block;box-sizing:border-box;block-size:${v}`;
    document.body.append(probe);
    const h = probe.getBoundingClientRect().height;
    probe.remove();
    return h;
  }, value);

export const computed = (l: Locator, prop: string) =>
  l.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

/** H38: the md field/button height. */
export const H38 = 'var(--ocx-control-2xl)';
