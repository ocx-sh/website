// @vitest-environment jsdom
// ShellSession `play`: the schedule, and the player's DOM (typing, outputs after commands, pausing).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { plan, shown, start, TYPE_MS } from '../src/components/shell-session-play.mjs';

const line = (text: string) => `<div class="ec-line"><div class="code"><span>${text}</span></div></div>`;
const entry = (kind: string, ...lines: string[]) =>
  `<div data-ocx-session="${kind}"><pre><code>${lines.map(line).join('')}</code></pre></div>`;

describe('plan and shown', () => {
  const p = plan([
    { kind: 'command', lines: [10] },
    { kind: 'output', lines: [4, 5] },
    { kind: 'command', lines: [3] },
  ]);

  it('types a command at 40 ms per character and shows its output after it', () => {
    expect(TYPE_MS).toBe(40);
    expect(shown(p.lines[0]!, 0)).toBe(0);
    expect(shown(p.lines[0]!, 200)).toBe(5);
    expect(shown(p.lines[0]!, 99999)).toBe(10);
    expect(p.lines[1]!.at).toBeGreaterThan(p.lines[0]!.at + 10 * TYPE_MS);
    expect(shown(p.lines[1]!, p.lines[1]!.at - 1)).toBe(-1);
    expect(shown(p.lines[1]!, p.lines[1]!.at)).toBe(4);
    expect(p.lines[3]!.at).toBeGreaterThan(p.lines[1]!.at);
  });

  it('the lines of one command type one after the other', () => {
    const q = plan([{ kind: 'command', lines: [10, 4] }]);
    expect(q.lines[1]!.at).toBeGreaterThan(q.lines[0]!.at + 10 * TYPE_MS);
  });

  it('every command finishes typing before the next line starts, and the loop outlasts the last line', () => {
    p.lines.forEach((l, i) => {
      if (l.typed) expect(l.at + l.chars * TYPE_MS).toBeLessThan(p.lines[i + 1]?.at ?? p.total);
    });
    expect(p.total).toBeGreaterThan(p.lines[3]!.at + 3 * TYPE_MS);
  });
});

describe('start', () => {
  let rafs: ((t: number) => void)[] = [];
  let now = 0;
  let visible: (v: boolean) => void = () => {};
  let root: HTMLElement;
  const texts = () => [...root.querySelectorAll('.code')].map((c) => c.textContent);
  const hidden = () => [...root.querySelectorAll<HTMLElement>('.ec-line')].map((l) => l.style.visibility === 'hidden');
  const advance = (ms: number) => {
    now += ms;
    const run = rafs;
    rafs = [];
    run.forEach((f) => f(now));
  };

  beforeEach(() => {
    rafs = [];
    now = 0;
    vi.stubGlobal('IntersectionObserver', function (cb: (e: { isIntersecting: boolean }[]) => void) {
      visible = (v) => cb([{ isIntersecting: v }]);
      return { observe() {}, disconnect() {} };
    });
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((f) => rafs.push(f));
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => void (rafs = []));
    vi.spyOn(window.performance, 'now').mockImplementation(() => now);
    document.body.innerHTML = `<div class="ocx-shell-session" data-ocx-play>${entry('command', 'ocx lock')}${entry('output', 'locked 3')}</div>`;
    root = document.querySelector('.ocx-shell-session')!;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('starts empty, types the command, then shows the output', () => {
    start(root);
    expect(texts()).toEqual(['', '']);
    expect(hidden()).toEqual([false, true]);
    advance(200);
    expect(texts()[0]).toBe('ocx l'.slice(0, 5));
    expect(root.querySelector('.code[data-cur]')).not.toBeNull();
    advance(2000);
    expect(texts()).toEqual(['ocx lock', 'locked 3']);
    expect(hidden()).toEqual([false, false]);
    expect(root.querySelector('[data-cur]')).toBeNull();
  });

  it('pauses off screen and when the tab is hidden, and keeps its place', () => {
    start(root);
    advance(200);
    visible(false);
    expect(rafs).toHaveLength(0);
    now += 60000;
    visible(true);
    advance(40);
    expect(texts()[0]).toBe('ocx lo');
  });

  it('adopts the cursor sheet once per document', async () => {
    vi.resetModules();
    const fresh = await import('../src/components/shell-session-play.mjs');
    const sheets: string[] = [];
    vi.stubGlobal(
      'CSSStyleSheet',
      class {
        replaceSync(css: string) {
          sheets.push(css);
        }
      },
    );
    Object.defineProperty(document, 'adoptedStyleSheets', { configurable: true, writable: true, value: [] });
    fresh.start(root).stop();
    fresh.start(root).stop();
    expect(sheets).toHaveLength(1);
    expect(sheets[0]).toContain('[data-cur]');
    expect(document.adoptedStyleSheets).toHaveLength(1);
  });

  it('loops', () => {
    start(root);
    const { total } = plan([
      { kind: 'command', lines: [8] },
      { kind: 'output', lines: [8] },
    ]);
    advance(total + 80);
    expect(texts()).toEqual(['oc', '']);
  });

  it('stop restores the full text', () => {
    const s = start(root);
    advance(80);
    s.stop();
    expect(texts()).toEqual(['ocx lock', 'locked 3']);
    expect(hidden()).toEqual([false, false]);
    expect(rafs).toHaveLength(0);
  });
});
