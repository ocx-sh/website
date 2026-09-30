// Theme toggle shared by the header and the mobile menu (C-024): every `[data-ocx-theme]` is a
// CycleButton (light, dark). Starlight's ThemeProvider reads localStorage['starlight-theme'] and
// <html data-theme>; this keeps both, and every button, in step.
import { install, setValue } from '../components/ui/cycle-button.mjs';

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
    root.dataset['theme'] = theme;
    sync();
    try {
      doc.defaultView?.localStorage.setItem('starlight-theme', theme);
    } catch {
      // Storage blocked: the page still flips.
    }
  });
}
