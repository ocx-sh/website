// ShellSession `play`: types each command line in a loop, an output appearing after its command. Every
// line stays laid out; the ones not yet reached are `visibility: hidden`, so the box never changes size.
// The clock runs only while the session is on screen and the tab is visible.
import cursorCss from './shell-session-cursor.css?inline';

// The cursor's sheet lives here, not in ShellSession.astro: that sheet is held under the inline-CSS cap, and
// only a playing session needs the cursor. The module never starts under reduced motion.
// The cursor is the typing line's own background, not a node moving along the text: a moving node (an element
// or a pseudo-element) counts as layout shift on every character. The line shrinks to its text (`justify-self`),
// so its box only grows to the right, and the cursor sits in the padding after the text.
// (shell-session-cursor.css, built and minified by `?inline`)
const CURSOR = cursorCss;
/** @type {WeakSet<Document>} */
const styled = new WeakSet();

/** Adopt the cursor sheet once per document, where constructable sheets exist. @param {Document} doc */
function styleCursor(doc) {
  if (styled.has(doc) || typeof CSSStyleSheet === 'undefined') return;
  styled.add(doc);
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(CURSOR);
    doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
  } catch {
    // No cursor on an engine without constructable sheets; the typing still plays.
  }
}

/** Milliseconds per typed character. */
export const TYPE_MS = 40;
const LINE_MS = 120;
const PAUSE_MS = 400;
const OUTPUT_MS = 900;
const HOLD_MS = 3000;

/**
 * When each line starts and the loop length. A command line types at `TYPE_MS` per character; the
 * output lines of a command all appear together after it.
 * @param {{ kind: 'command' | 'output', lines: number[] }[]} entries characters per line, by entry
 * @returns {{ lines: { at: number, chars: number, typed: boolean }[], total: number }}
 */
export function plan(entries) {
  let t = 0;
  /** @type {{ at: number, chars: number, typed: boolean }[]} */
  const lines = [];
  for (const { kind, lines: counts } of entries) {
    const typed = kind === 'command';
    for (const chars of counts) {
      lines.push({ at: t, chars, typed });
      if (typed) t += chars * TYPE_MS + LINE_MS;
    }
    t += typed ? PAUSE_MS : OUTPUT_MS;
  }
  return { lines, total: t + HOLD_MS };
}

/**
 * How much of a line shows `ms` into the loop: -1 not yet started, else the characters typed.
 * @param {{ at: number, chars: number, typed: boolean }} line
 * @param {number} ms
 * @returns {number}
 */
export function shown(line, ms) {
  if (ms < line.at) return -1;
  return line.typed ? Math.min(line.chars, Math.floor((ms - line.at) / TYPE_MS)) : line.chars;
}

/**
 * @param {Document} doc
 * @param {Element} el
 * @returns {Text[]}
 */
function textNodes(doc, el) {
  const walker = doc.createTreeWalker(el, 4);
  /** @type {Text[]} */
  const out = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(/** @type {Text} */ (n));
  return out;
}

/**
 * Start playing a ShellSession root. Returns the session `lazy.mjs` expects.
 * @param {HTMLElement} root `.ocx-shell-session[data-ocx-play]`
 * @returns {{ api: undefined, stop: () => void }}
 */
export function start(root) {
  const doc = root.ownerDocument;
  const view = /** @type {Window} */ (doc.defaultView);
  styleCursor(doc);
  const entries = [...root.querySelectorAll('[data-ocx-session]')].map((entry) => ({
    kind: /** @type {'command' | 'output'} */ (entry.getAttribute('data-ocx-session')),
    rows: [...entry.querySelectorAll('.ec-line')].map((row) => {
      const code = /** @type {HTMLElement} */ (row.querySelector('.code'));
      const nodes = textNodes(doc, code);
      return { row: /** @type {HTMLElement} */ (row), code, nodes, full: nodes.map((n) => n.data) };
    }),
  }));
  const rows = entries.flatMap((e) => e.rows);
  const { lines, total } = plan(
    entries.map((e) => ({ kind: e.kind, lines: e.rows.map((r) => r.full.join('').length) })),
  );

  /** @param {number} ms */
  const paint = (ms) => {
    let current = -1;
    rows.forEach((r, i) => {
      const n = shown(/** @type {NonNullable<(typeof lines)[number]>} */ (lines[i]), ms);
      r.row.style.visibility = n < 0 ? 'hidden' : 'visible';
      if (n >= 0 && lines[i]?.typed && n < (lines[i]?.chars ?? 0)) current = i;
      let left = Math.max(n, 0);
      r.nodes.forEach((node, k) => {
        const text = r.full[k] ?? '';
        node.data = text.slice(0, left);
        left = Math.max(0, left - text.length);
      });
    });
    rows.forEach((r, i) => r.code.toggleAttribute('data-cur', i === current));
  };

  let elapsed = 0;
  let last = 0;
  let frame = 0;
  let onScreen = true;
  const running = () => onScreen && !doc.hidden;
  const tick = (/** @type {number} */ now) => {
    frame = 0;
    if (!running()) return;
    elapsed = (elapsed + now - last) % total;
    last = now;
    paint(elapsed);
    frame = view.requestAnimationFrame(tick);
  };
  const sync = () => {
    if (running() && !frame) {
      last = view.performance.now();
      frame = view.requestAnimationFrame(tick);
    } else if (!running() && frame) {
      view.cancelAnimationFrame(frame);
      frame = 0;
    }
  };
  const io = new IntersectionObserver((/** @type {IntersectionObserverEntry[]} */ es) => {
    onScreen = es[es.length - 1]?.isIntersecting ?? onScreen;
    sync();
  });
  io.observe(root);
  doc.addEventListener('visibilitychange', sync);
  paint(0);
  sync();

  return {
    api: undefined,
    stop() {
      io.disconnect();
      doc.removeEventListener('visibilitychange', sync);
      if (frame) view.cancelAnimationFrame(frame);
      frame = 0;
      for (const r of rows) {
        r.row.style.removeProperty('visibility');
        r.code.removeAttribute('data-cur');
        r.nodes.forEach((n, k) => (n.data = r.full[k] ?? ''));
      }
    },
  };
}
