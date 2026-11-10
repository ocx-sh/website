// onRoots (ui/roots.mjs): mounts existing roots once and rescans inserted subtrees on `ocx:inserted`.
// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  document.body.innerHTML = '';
});

const load = () => import('../src/components/ui/roots.mjs');

it('mounts roots already in the document once, however often it is called', async () => {
  const { onRoots } = await load();
  document.body.innerHTML = '<i class="r"></i><i class="r"></i>';
  const fn = vi.fn();
  onRoots('.r', fn);
  onRoots('.r', fn);
  expect(fn).toHaveBeenCalledTimes(2);
});

it('mounts roots inside an inserted subtree, and the inserted element itself, once', async () => {
  const { onRoots } = await load();
  const fn = vi.fn();
  onRoots('.r', fn);
  const host = document.body.appendChild(document.createElement('div'));
  host.innerHTML = '<p><i class="r"></i></p>';
  host.dispatchEvent(new Event('ocx:inserted', { bubbles: true }));
  host.dispatchEvent(new Event('ocx:inserted', { bubbles: true }));
  expect(fn).toHaveBeenCalledTimes(1);
  const self = document.body.appendChild(document.createElement('i'));
  self.className = 'r';
  self.dispatchEvent(new Event('ocx:inserted', { bubbles: true }));
  expect(fn).toHaveBeenCalledTimes(2);
});

it('ignores elements that do not match', async () => {
  const { onRoots } = await load();
  const fn = vi.fn();
  onRoots('.r', fn);
  const host = document.body.appendChild(document.createElement('div'));
  host.innerHTML = '<i class="other"></i>';
  host.dispatchEvent(new Event('ocx:inserted', { bubbles: true }));
  expect(fn).not.toHaveBeenCalled();
});
