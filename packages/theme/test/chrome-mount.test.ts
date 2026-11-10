// @vitest-environment jsdom
// mountChrome (src/chrome.mjs): the page's one early glue, on a fixture DOM. Missing pieces skip.
import { afterEach, describe, expect, it, vi } from 'vitest';
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

  const sidebar = () => {
    document.body.innerHTML =
      '<nav id="starlight__sidebar"><ul><li data-zag-root="collapsible" data-zag-state="idle">' +
      '<button type="button" data-part="trigger" aria-expanded="false">G</button><ul data-part="content" hidden></ul></li></ul></nav>';
    mountChrome(document);
    const root = document.querySelector<HTMLElement>('[data-zag-root="collapsible"]')!;
    return { root, button: root.querySelector('button')!, list: root.querySelector<HTMLElement>('ul')! };
  };

  it('sidebar groups stay idle and closed until the first touch, which loads the one controller', async () => {
    const { root, button } = sidebar();
    await new Promise((r) => setTimeout(r, 50));
    expect(root.dataset['zagState']).toBe('idle');
    button.dispatchEvent(new Event('focusin', { bubbles: true }));
    await vi.waitFor(() => expect(root.dataset['zagState']).toBe('live'));
  });

  it('a click before the controller has loaded opens the group once it has', async () => {
    const { root, button, list } = sidebar();
    button.dispatchEvent(new Event('pointerover', { bubbles: true })); // the touch that wakes it
    button.click();
    await vi.waitFor(() => expect(root.dataset['zagState']).toBe('live'));
    expect([list.hidden, button.getAttribute('aria-expanded')]).toEqual([false, 'true']);
  });

  it('a bare click with no touch before it wakes the controller and opens the group', async () => {
    const { root, button, list } = sidebar();
    button.click();
    await vi.waitFor(() => expect(root.dataset['zagState']).toBe('live'));
    expect([list.hidden, button.getAttribute('aria-expanded')]).toEqual([false, 'true']);
  });

  it('a link click, then a trigger click, while the controller loads: the trigger click still toggles', async () => {
    const { root, button, list } = sidebar();
    const link = document.createElement('a');
    link.href = '#x';
    document.querySelector('#starlight__sidebar')!.append(link);
    link.click();
    button.click();
    await vi.waitFor(() => expect(root.dataset['zagState']).toBe('live'));
    expect(list.hidden).toBe(false);
  });

  it('clicks on two groups while it loads toggle both', async () => {
    document.body.innerHTML =
      '<nav id="starlight__sidebar"><ul>' +
      [0, 1]
        .map(
          () =>
            '<li data-zag-root="collapsible" data-zag-state="idle"><button type="button" data-part="trigger" aria-expanded="false">G</button><ul data-part="content" hidden></ul></li>',
        )
        .join('') +
      '</ul></nav>';
    mountChrome(document);
    const buttons = [...document.querySelectorAll('button')];
    buttons.forEach((b) => b.click());
    await vi.waitFor(() => expect(buttons.every((b) => b.getAttribute('aria-expanded') === 'true')).toBe(true));
  });

  it('is a no-op without a sidebar or drawer', () => {
    document.body.innerHTML = '<main>plain</main>';
    expect(() => mountChrome(document)).not.toThrow();
    expect(document.body.innerHTML).toBe('<main>plain</main>');
  });
});
