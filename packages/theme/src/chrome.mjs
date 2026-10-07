// Page chrome glue shared by Search.astro's every-page script and Shell: toaster, theme toggles, the
// header nav, the sidebar groups and the mobile drawer. A missing element skips its step, so it is
// safe on pages without a sidebar. Each step loads its machine on first touch (C-113).
import { mount } from './components/ui/zag.mjs';
import { installToaster } from './starlight/toaster.mjs';
import { wireThemeToggles } from './starlight/theme-toggle.mjs';

/** @typedef {{ open: boolean, setOpen: (open: boolean) => void }} Api */

/** @param {Document} doc */
export function mountChrome(doc) {
  // The Footer's toaster (C-181) starts here too: a Footer script was one more early request.
  installToaster(doc);
  // The theme toggle (ThemeSelect) is a CycleButton; its one delegated click listener installs here
  // for every CycleButton on the page, so neither ThemeSelect nor CycleButton ships a script.
  wireThemeToggles(doc);

  // The header section nav (C-192) loads on the first pointerenter/focusin on the nav (C-113).
  const nav = doc.querySelector('.ocx-header [data-zag-root="navigation-menu"]');
  if (nav instanceof HTMLElement) mount(nav, { load: () => import('./components/navigation-menu.zag.mjs') });

  // The sidebar and the mobile menu mount here too (C-230, C-231). The mark tells the sidebar's
  // inline script a mount runs; without it the groups open as a fallback.
  const sidebar = doc.getElementById('starlight__sidebar');
  const persist = sidebar?.querySelector('sl-sidebar-state-persist');
  if (persist instanceof HTMLElement) persist.dataset['mounted'] = '';
  for (const group of sidebar?.querySelectorAll('[data-zag-root="collapsible"]') ?? [])
    if (group instanceof HTMLElement) mount(group, { load: () => import('./components/collapsible.zag.mjs') });
  // The mobile menu toggle's first tap loads the drawer and opens it on that tap; after a load error
  // the pane opens through its native popover instead (S-102), and later taps are the popover's.
  const menu = doc.querySelector('.ocx-menu[data-zag-root="drawer"]');
  if (menu instanceof HTMLElement) {
    const drawer = mount(menu, {
      load: () => import('./starlight/mobile-menu.zag.mjs'),
      trigger: 'manual',
      replay: false,
    });
    menu.querySelector('button')?.addEventListener('click', () => {
      if (menu.dataset['zagState'] !== 'idle') return;
      // Opened natively by a tap before this script ran: this tap is the popover's (it closes it);
      // the machine starts on the next one.
      if (sidebar?.matches(':popover-open')) return;
      void drawer.start().then(() => {
        const api = /** @type {Api | undefined} */ (drawer.api);
        if (api) api.setOpen(true);
        else sidebar?.showPopover();
      });
    });
  }
}
