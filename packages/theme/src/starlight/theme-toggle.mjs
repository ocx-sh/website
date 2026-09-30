// Theme toggle shared by the header and the mobile menu (C-024): every `[data-ocx-theme]` is a
// CycleButton (light, dark). Starlight's ThemeProvider reads localStorage['starlight-theme'] and
// <html data-theme>; this keeps both, and every button, in step.
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
 * Sync every `[data-ocx-theme]` button in `doc` to the page theme and follow their cycle event:
 * set `html[data-theme]`, sync the buttons and persist; storage failures (private mode) are ignored
 * so the toggle still works for the current page.
 * @param {Document} [doc]
 * @returns {void}
 */
export function wireThemeToggles(doc = document) {
  const root = doc.documentElement;
  // ThemeProvider always sets `light` or `dark`; anything else leaves the SSR `light` (setValue ignores it).
  const sync = () => {
    for (const btn of doc.querySelectorAll('[data-ocx-theme]'))
      setValue(btn, /** @type {string} */ (root.dataset['theme']));
  };
  install(doc);
  sync();
  doc.addEventListener('ocx:cycle-button:change', (event) => {
    // CycleButton dispatches it on the button itself.
    if (!(/** @type {Element | null} */ (event.target)?.matches?.('[data-ocx-theme]'))) return;
    const theme = /** @type {CustomEvent<{ value: string }>} */ (event).detail.value;
    const apply = () => {
      root.dataset['theme'] = theme;
      sync();
    };
    switchTheme(doc, apply);
    try {
      doc.defaultView?.localStorage.setItem('starlight-theme', theme);
    } catch {
      // Storage blocked: the page still flips.
    }
  });
}
