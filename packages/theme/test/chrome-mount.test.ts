// @vitest-environment jsdom
// mountChrome (src/chrome.mjs): the page's one early glue, on a fixture DOM. Missing pieces skip.
import { afterEach, describe, expect, it } from 'vitest';
import { mountChrome } from '../src/chrome.mjs';

afterEach(() => {
  document.body.innerHTML = '';
  delete document.documentElement.dataset['theme'];
});

describe('mountChrome', () => {
  it('moves the toaster root to the body and syncs the theme toggle to html[data-theme]', () => {
    document.documentElement.dataset['theme'] = 'dark';
    document.body.innerHTML =
      '<div id="wrap"><div data-zag-root="toast" data-zag-state="idle"></div></div>' +
      '<button type="button" class="ocx-ui-cycle-button" data-ocx-theme data-value="light" data-cycle=\'[["light","Light"],["dark","Dark"]]\' aria-label="Light mode"></button>';
    mountChrome(document);
    expect(document.querySelector('#wrap [data-zag-root="toast"]')).toBeNull();
    expect(document.querySelector('body > [data-zag-root="toast"]')).not.toBeNull();
    expect(document.querySelector('[data-ocx-theme]')?.getAttribute('data-value')).toBe('dark');
  });

  it('mounts the header nav root lazily: it stays idle until the first hover', () => {
    document.body.innerHTML =
      '<div class="ocx-header"><div data-zag-root="navigation-menu" data-zag-state="idle"></div></div>';
    mountChrome(document);
    expect(document.querySelector('[data-zag-root="navigation-menu"]')?.getAttribute('data-zag-state')).toBe('idle');
  });

  it('is a no-op without a sidebar or drawer', () => {
    document.body.innerHTML = '<main>plain</main>';
    expect(() => mountChrome(document)).not.toThrow();
    expect(document.body.innerHTML).toBe('<main>plain</main>');
  });
});
