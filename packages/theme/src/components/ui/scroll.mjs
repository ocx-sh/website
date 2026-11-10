// Scroll-driven effects on one passive, rAF-throttled scroll listener per page. A component script calls
// `track(el, kind)`; each frame reads every tracked rect first, then writes custom properties only (no
// layout thrash), and the component's CSS turns them into transform and opacity. The server markup is the
// readable state: no JS, or reduced motion, shows everything, and an element starts moving from the state it
// already has. Under reduced motion `track` does nothing.

/** @param {number} v */
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/**
 * easeOutCubic over a 0..1 clamped input.
 * @param {number} v
 * @returns {number}
 */
export const ease = (v) => 1 - (1 - clamp01(v)) ** 3;

/**
 * How far a pinned stage has travelled through its section, 0..1. `stick` is its sticky `top`.
 * @param {number} top section top relative to the viewport
 * @param {number} height section height
 * @param {number} vh viewport height
 * @param {number} stick
 * @returns {number}
 */
export const pinProgress = (top, height, vh, stick) => clamp01((stick - top) / Math.max(1, height - vh + stick));

/**
 * Fly-in `e` and strike-through `s` of stage item `i` at progress `p`: pairs enter 0.06 apart.
 * @param {number} p
 * @param {number} i
 * @returns {{ e: number, s: number }}
 */
export const cardAt = (p, i) => ({
  e: ease((p - Math.floor(i / 2) * 0.06) / 0.22),
  s: ease((p - 0.42 - i * 0.025) / 0.14),
});

/**
 * The finale of a stage.
 * @param {number} p
 * @returns {number}
 */
export const finalAt = (p) => ease((p - 0.68) / 0.18);

/**
 * Reveal of a block whose top edge is `top` px below the viewport top: starts 80px in, takes 260px.
 * @param {number} top
 * @param {number} vh
 * @returns {number}
 */
export const revealAt = (top, vh) => ease((vh - top - 80) / 260);

/**
 * Opacity of a fading block: gone after 0.55 of a viewport of scrolling.
 * @param {number} sy
 * @param {number} vh
 * @returns {number}
 */
export const heroFade = (sy, vh) => clamp01(1 - sy / (vh * 0.55));

/**
 * Items never fly in from further than half the viewport.
 * @param {number} vw
 * @returns {number}
 */
export const flyDistance = (vw) => Math.min(420, vw * 0.5);

/** @typedef {{ vh: number, vw: number, sy: number, readonly span: number }} View `span` is measured on first use in a frame. */
/** @typedef {{ el: Element, read: (v: View) => () => void }} Tracked */

/** @type {Set<Tracked>} */
const tracked = new Set();
let started = false;
let raf = 0;

/** What `put` wrote last, per element and property. @type {WeakMap<HTMLElement, Map<string, string>>} */
const written = new WeakMap();

/**
 * Sets a custom property unless it already has this value: a still element costs the frame no style write.
 * @param {HTMLElement} el
 * @param {string} name
 * @param {number | string} value
 */
const put = (el, name, value) => {
  const text = String(value);
  let seen = written.get(el);
  if (!seen) written.set(el, (seen = /** @type {Map<string, string>} */ (new Map())));
  if (seen.get(name) === text) return;
  seen.set(name, text);
  el.style.setProperty(name, text);
};

/** The element's current translateY in px, so a measurement ignores the element's own motion. @param {Element} el */
function shiftY(el) {
  try {
    return new DOMMatrix(getComputedStyle(el).transform).m42 || 0;
  } catch {
    return 0;
  }
}

/**
 * What each kind reads and writes. `read` returns the writer for its frame.
 * @type {Record<string, (el: HTMLElement) => (v: View) => () => void>}
 */
const KINDS = {
  /** `--ocx-prog`: the page's scroll progress, 0..1. */
  progress: (el) => (v) => {
    const p = clamp01(v.sy / v.span);
    return () => put(el, '--ocx-prog', p);
  },
  /** `--ocx-fade-y` (scroll offset), `--ocx-fade-o` (opacity), `--ocx-fade-k` (parallax rate, the attribute). */
  fade: (el) => {
    put(el, '--ocx-fade-k', parseFloat(el.getAttribute('data-ocx-fade') ?? '') || 0.25);
    let lastO = 1;
    return (v) => {
      const o = heroFade(v.sy, v.vh);
      // Gone: the offset of an invisible block is not worth a write per frame.
      const gone = o === 0 && lastO === 0;
      lastO = o;
      return () => {
        if (!gone) put(el, '--ocx-fade-y', v.sy);
        put(el, '--ocx-fade-o', o);
      };
    };
  },
  /**
   * `--ocx-reveal`: 0..1 as the element's top edge rises into the viewport; it hides again on the way back up. The element's
   * own translation is measured again only after the value it makes changed, not every frame.
   */
  reveal: (el) => {
    let applied = NaN;
    let measured = NaN;
    let shift = 0;
    return (v) => {
      if (applied !== measured) {
        shift = shiftY(el);
        measured = applied;
      }
      const r = revealAt(el.getBoundingClientRect().top - shift, v.vh);
      return () => {
        put(el, '--ocx-reveal', r);
        applied = r;
      };
    };
  },
  /** A pinned stage: `--ocx-e` / `--ocx-s` on each child of `[data-stage-items]`, `--ocx-f` on `[data-stage-finale]`. */
  stage: (el) => {
    const pin = /** @type {HTMLElement | null} */ (el.querySelector('[data-stage-pin]'));
    const items = /** @type {HTMLElement[]} */ ([...el.querySelectorAll('[data-stage-items] > *')]);
    const finale = /** @type {HTMLElement | null} */ (el.querySelector('[data-stage-finale]'));
    let stick = 0;
    let sized = '';
    return (v) => {
      // `top` of the pin changes with the viewport only.
      if (pin && sized !== `${v.vw}x${v.vh}`) {
        sized = `${v.vw}x${v.vh}`;
        stick = parseFloat(getComputedStyle(pin).top) || 0;
      }
      const rect = el.getBoundingClientRect();
      const p = pinProgress(rect.top, rect.height, v.vh, stick);
      return () => {
        if (pin) put(pin, '--ocx-stage-dist', `${flyDistance(v.vw)}px`);
        items.forEach((item, i) => {
          const { e, s } = cardAt(p, i);
          put(item, '--ocx-e', e);
          put(item, '--ocx-s', s);
        });
        if (finale) put(finale, '--ocx-f', finalAt(p));
      };
    };
  },
};

function frame() {
  raf = 0;
  /** @type {number | undefined} */
  let span;
  /** @type {View} */
  const view = {
    vh: innerHeight,
    vw: innerWidth,
    sy: scrollY,
    // Reading it forces layout: only the progress kind pays for that.
    get span() {
      return (span ??= Math.max(1, document.documentElement.scrollHeight - innerHeight));
    },
  };
  for (const t of tracked) if (!t.el.isConnected) tracked.delete(t);
  const writes = [...tracked].map((t) => t.read(view));
  for (const write of writes) write();
}

/** Run a frame on the next animation frame, once however many scroll events come. */
export function schedule() {
  raf ||= requestAnimationFrame(frame);
}

/**
 * Drive `el` by scroll. `kind` is `progress`, `fade`, `reveal` or `stage`. Draws the current state on the next animation
 * frame, before the next paint (so the element never waits for the first scroll) and returns whether it tracks (no, under reduced motion).
 * @param {HTMLElement} el
 * @param {'progress' | 'fade' | 'reveal' | 'stage'} kind
 * @returns {boolean}
 */
export function track(el, kind) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  const make = /** @type {NonNullable<(typeof KINDS)[typeof kind]>} */ (KINDS[kind]);
  tracked.add({ el, read: make(el) });
  if (!started) {
    started = true;
    addEventListener('scroll', schedule, { passive: true });
    addEventListener('resize', schedule);
  }
  schedule();
  return true;
}
