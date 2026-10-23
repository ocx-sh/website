// Theme toggle shared by the header and the mobile menu (C-024): every `[data-ocx-theme]` is a
// CycleButton (light, dark). Starlight's ThemeProvider reads localStorage['starlight-theme'] and
// <html data-theme>; this keeps both, `<html class="dark">` (D-127), and every button, in step. A click to
// the OS's own scheme stores `auto` and a page with no pinned choice follows OS changes live (D-133).
import { install, setValue } from '../components/ui/cycle-button.mjs';

/**
 * Run `apply` (the scheme flip) as a root crossfade (D-R9): inside `document.startViewTransition` when
 * the browser has it and the motion tokens are not zeroed (reduced motion), otherwise at once.
 * `data-ocx-theme-switch` on `<html>` holds every control's own transition off (starlight.css) from
 * before the flip until the crossfade finishes, or until the next frame after an instant flip.
 * @param {Document} doc
 * @param {() => void} apply
 * @returns {void}
 */
function switchTheme(doc, apply) {
  const root = doc.documentElement;
  const view = doc.defaultView;
  const done = () => delete root.dataset['ocxThemeSwitch'];
  root.dataset['ocxThemeSwitch'] = '';
  const duration = parseFloat(view?.getComputedStyle(root).getPropertyValue('--ocx-duration-moderate') ?? '');
  if (duration > 0 && typeof doc.startViewTransition === 'function') {
    const transition = doc.startViewTransition(apply);
    // A transition skipped by a quick second click rejects `ready`: nothing to report.
    transition.ready.catch(() => {});
    void transition.finished.finally(done);
    return;
  }
  apply();
  // Style the flipped page while the attribute still holds transitions off, then drop it.
  void root.offsetWidth;
  if (view?.requestAnimationFrame) view.requestAnimationFrame(done);
  else done();
}

/**
 * The pinned scheme in storage, else `undefined` (follow the OS). A 0.5.x visitor's choice was already moved
 * to `starlight-theme` by THEME_SCRIPT (D-132). A blocked storage reads as nothing pinned.
 * @param {Storage | undefined} storage
 * @returns {'light' | 'dark' | undefined}
 */
export function storedTheme(storage) {
  let value;
  try {
    value = storage?.getItem('starlight-theme');
  } catch {
    // Storage blocked: nothing pinned.
  }
  return value === 'light' || value === 'dark' ? value : undefined;
}

/**
 * The window's localStorage, or `undefined` when reaching it throws (blocked storage makes the getter throw).
 * @param {Window | null} view
 * @returns {Storage | undefined}
 */
function localStore(view) {
  try {
    return view?.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Sync every `[data-ocx-theme]` button in `doc` to the page theme and follow their cycle event:
 * set `html[data-theme]`, sync the buttons and persist; storage failures (private mode) are ignored
 * so the toggle still works for the current page.
 * @param {Document} [doc]
 * @returns {void}
 */
export function wireThemeToggles(doc = document) {
  const root = doc.documentElement;
  const view = doc.defaultView;
  const osLight = view?.matchMedia?.('(prefers-color-scheme: light)');
  // ThemeProvider always sets `light` or `dark`; anything else leaves the SSR `light` (setValue ignores it).
  const sync = () => {
    for (const btn of doc.querySelectorAll('[data-ocx-theme]'))
      setValue(btn, /** @type {string} */ (root.dataset['theme']));
  };
  /** @param {string} theme */
  const set = (theme) => {
    root.dataset['theme'] = theme;
    root.classList.toggle('dark', theme === 'dark');
    sync();
  };
  install(doc);
  sync();
  // No pinned choice: the page follows the OS as it changes (an OS pin or a click to the OS value is `auto`).
  osLight?.addEventListener?.('change', () => {
    if (!storedTheme(localStore(view))) set(osLight.matches ? 'light' : 'dark');
  });
  doc.addEventListener('ocx:cycle-button:change', (event) => {
    // CycleButton dispatches it on the button itself.
    if (!(/** @type {Element | null} */ (event.target)?.matches?.('[data-ocx-theme]'))) return;
    const theme = /** @type {CustomEvent<{ value: string }>} */ (event).detail.value;
    switchTheme(doc, () => set(theme));
    const isOs = osLight && theme === (osLight.matches ? 'light' : 'dark');
    try {
      view?.localStorage.setItem('starlight-theme', isOs ? 'auto' : theme);
    } catch {
      // Storage blocked: the page still flips.
    }
  });
}
