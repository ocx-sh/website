// C-114 leak helper: runs `cycle` (open/close, mount/unmount, …) repeatedly and
// asserts the page's CDP counters come back to where they started. Chromium
// only (CDP). Thresholds leave room for lazily created singletons and GC noise. The warm-up is as
// long as the measured run: V8's compiled code and type feedback for a freshly loaded machine keep
// growing the heap for the first ~20 cycles (measured on drawer.zag: +490 kB, then +84, +60, +49,
// +24, +7 kB per 20 cycles), which one warm-up cycle counted as a leak.
import { test, type CDPSession, type Page } from '@playwright/test';

export interface LeakOptions {
  /** Measured cycles, after as many warm-up cycles (default 20). */
  n?: number;
}

type Counters = Record<'JSEventListeners' | 'Nodes' | 'JSHeapUsedSize', number>;

async function snapshot(cdp: CDPSession): Promise<Counters> {
  // Two passes: the first can leave objects only freed by the next (weak refs, finalizers).
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.collectGarbage');
  const { metrics } = await cdp.send('Performance.getMetrics');
  const get = (name: string) => metrics.find((m) => m.name === name)?.value ?? Number.NaN;
  return { JSEventListeners: get('JSEventListeners'), Nodes: get('Nodes'), JSHeapUsedSize: get('JSHeapUsedSize') };
}

const KEYS = ['JSEventListeners', 'Nodes', 'JSHeapUsedSize'] as const;

/** Counters of `end` past their allowance over `base`: listeners + 2, nodes + 20, heap × 1.10 + 256 KiB. */
function breached(base: Counters, end: Counters): (keyof Counters)[] {
  const caps: Counters = {
    JSEventListeners: base.JSEventListeners + 2,
    Nodes: base.Nodes + 20,
    JSHeapUsedSize: base.JSHeapUsedSize * 1.1 + 256 * 1024,
  };
  return KEYS.filter((k) => !(end[k] <= caps[k]));
}

/**
 * `n` warm-up cycles, GC, snapshot, `n` cycles, GC, snapshot. A breach gets a second window of `n`
 * cycles measured from `end`, and throws only for a counter that breaches again: a leak grows every
 * window, a one-off heap jump (a V8 tier-up, a lazily grown table) does not (~1 in 100 runs did).
 * Every run records base/end (and the second window) as test annotations.
 */
export async function expectNoLeak(
  page: Page,
  cycle: () => Promise<void>,
  { n = 20 }: LeakOptions = {},
): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Performance.enable');
    for (let i = 0; i < n; i++) await cycle();
    const base = await snapshot(cdp);
    for (let i = 0; i < n; i++) await cycle();
    const end = await snapshot(cdp);
    const note = (label: string, c: Counters) =>
      test.info().annotations.push({ type: `leak ${label}`, description: KEYS.map((k) => `${k}=${c[k]}`).join(' ') });
    note('base', base);
    note('end', end);
    const first = breached(base, end);
    if (!first.length) return;
    for (let i = 0; i < n; i++) await cycle();
    const again = await snapshot(cdp);
    note('again', again);
    const leaks = breached(end, again).filter((k) => first.includes(k));
    if (leaks.length)
      throw new Error(
        `leak after 2 × ${n} cycles: ${leaks.map((k) => `${k} ${base[k]} → ${end[k]} → ${again[k]}`).join('; ')}`,
      );
  } finally {
    await cdp.detach();
  }
}
