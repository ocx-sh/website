// Mount helper for component scripts that may run on markup inserted after load (a Deferred fragment).
// `onRoots(selector, fn)` calls `fn(el)` once per matching element: those already in the document now,
// and those in any subtree announced by a bubbling `ocx:inserted` event later. Component scripts use
// this instead of scanning `document` themselves; a test enforces it. A selector belongs to one
// component: a second call with the same selector rescans but never remounts an element it already holds.

/** @type {Map<string, WeakSet<Element>>} */
const mounted = new Map();

/**
 * @param {string} selector
 * @param {(el: HTMLElement) => void} fn
 * @returns {void}
 */
export function onRoots(selector, fn) {
  const first = !mounted.has(selector);
  const done = mounted.get(selector) ?? new WeakSet();
  mounted.set(selector, done);
  /** @param {ParentNode} scope */
  const scan = (scope) => {
    const hits = [...scope.querySelectorAll(selector)];
    if (scope instanceof Element && scope.matches(selector)) hits.unshift(scope);
    for (const el of hits) {
      if (done.has(el)) continue;
      done.add(el);
      fn(/** @type {HTMLElement} */ (el));
    }
  };
  scan(document);
  if (first)
    document.addEventListener('ocx:inserted', (e) => {
      if (e.target instanceof Element) scan(e.target);
    });
}
