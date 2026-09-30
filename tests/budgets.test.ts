// C-110: the budgets module holds every page class at the plan's caps and
// classifies every gated page into exactly one class.
import { describe, expect, it } from 'vitest';
import { BUDGETS, budgetOf, classOf, examplePages, PAGEFIND_GZ_MAX, PRE_JS_VISIBLE } from './budgets.mjs';

const KB = 1024;

describe('C-110 budgets module', () => {
  // Z13 ratchet (Spec Delta MODIFIED C-110): measured max × 1.15, rounded up; a value only goes up
  // with a Spec Delta row. Measured (Schedule log): content e2e/lhci preJsGz 9,466, postJsGz 56,806
  // (chrome only), totalBytes 130,620, DOM 609, heap 3.45 MiB; showcase preJsGz 16,862, postJsGz
  // 82,427, totalBytes 142,602, DOM 1,054, heap 4.17 MiB; pagefindGz 51,456 (UI + engine, a query).
  const up = (measured: number, unit: number) => Math.ceil((measured * 1.15) / unit) * unit;
  it('holds the ratcheted caps for content and showcase', () => {
    expect(BUDGETS).toEqual({
      content: {
        preJsGz: up(9_466, KB),
        postJsGz: up(56_806, KB), // Pagefind excluded: PAGEFIND_GZ_MAX (Spec Delta MODIFIED C-110)
        totalBytes: up(130_620, KB),
        domElements: up(609, 100),
        heapMB: up(3.45, 1),
      },
      showcase: {
        preJsGz: up(16_862, KB),
        postJsGz: up(82_427, KB),
        totalBytes: up(142_602, KB),
        domElements: up(1_054, 100),
        heapMB: up(4.17, 1),
      },
      // Spec Delta ADDED C-110 `story`: ratcheted by the gate from the showcase ceiling.
      story: {
        preJsGz: up(10_902, KB),
        postJsGz: up(66_397, KB),
        totalBytes: up(117_541, KB),
        domElements: up(889, 100),
        heapMB: up(3.39, 1),
      },
    });
    for (const k of ['preJsGz', 'postJsGz', 'totalBytes', 'domElements', 'heapMB'] as const)
      expect(BUDGETS.story[k], k).toBeLessThanOrEqual(BUDGETS.showcase[k]);
    expect(PAGEFIND_GZ_MAX).toBe(up(51_456, KB));
    expect(PAGEFIND_GZ_MAX).toBeLessThanOrEqual(58 * KB); // the loop lead's cap (Spec Delta, amended)
  });

  it('classifies every gated page into exactly one class', () => {
    const pages = examplePages();
    expect(pages.length).toBeGreaterThan(0);
    for (const p of pages) expect(['content', 'showcase', 'story'], p).toContain(classOf(p));
    expect(pages).toContain('/docs/stories/tabs/default/');
  });

  it('maps components to showcase and the rest to content', () => {
    expect(classOf('/docs/components/')).toBe('showcase');
    expect(classOf('/docs/components/code/')).toBe('showcase');
    expect(classOf('/docs/')).toBe('content');
    expect(classOf('/docs/probe/long/')).toBe('content');
    expect(classOf('/docs/404.html')).toBe('content');
    expect(classOf('/docs/previews/')).toBe('content');
    expect(classOf('/docs/stories/tabs/default/')).toBe('story');
    expect(classOf('/docs/stories/iconography/icon/default/')).toBe('story');
  });

  // Spec Delta (MODIFIED C-110): only a showcase page with a `visible` component in its first
  // viewport gets its own preJsGz cap; nothing else about its budget, and no other page, changes.
  it('raises preJsGz only for the Toc page and its stories, to measured × 1.15 rounded up to 1 KiB', () => {
    expect(PRE_JS_VISIBLE).toEqual({
      '/docs/components/toc/': up(27_187, KB),
      '/docs/stories/toc/default/': up(25_033, KB),
      '/docs/stories/toc/states/': up(25_033, KB),
    });
    expect(budgetOf('/docs/components/toc/')).toEqual({ ...BUDGETS.showcase, preJsGz: 31 * KB });
    expect(budgetOf('/docs/stories/toc/default/')).toEqual({ ...BUDGETS.story, preJsGz: 29 * KB });
    for (const p of examplePages().filter((p) => !(p in PRE_JS_VISIBLE)))
      expect(budgetOf(p), p).toBe(BUDGETS[classOf(p)]);
  });

  it('fails on an unclassified page', () => {
    expect(() => classOf('/docs/guides/new-page/')).toThrow(/matches 0 classes/);
  });
});
