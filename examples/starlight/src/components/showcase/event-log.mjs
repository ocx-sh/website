// C-122: the showcase event log. Shows every `ocx:*` event dispatched inside a log's target.
// Theme wrappers dispatch through `emit()` (C-105), and the DOM has no wildcard listener, so the
// log wraps `dispatchEvent` — only on pages that render an EventLog.

const MAX = 50;
const installed = new WeakSet();

/**
 * Starts logging on this document: every `[data-showcase-log]` element lists the `ocx:*`
 * events dispatched on or inside the element its selector names. Idempotent.
 * @param {Document} doc
 */
export function installEventLogs(doc) {
  const win = doc.defaultView;
  if (!win || installed.has(doc)) return;
  installed.add(doc);
  const proto = win.EventTarget.prototype;
  // Read off the descriptor: a plain `proto.dispatchEvent` reference is an unbound method.
  /** @type {unknown} */ const original = Object.getOwnPropertyDescriptor(proto, 'dispatchEvent')?.value;
  if (typeof original !== 'function') return;
  const dispatch = /** @type {(this: EventTarget, event: Event) => boolean} */ (original);
  proto.dispatchEvent = function (event) {
    if (event.type.startsWith('ocx:') && this instanceof win.Node) record(doc, this, event);
    return dispatch.call(this, event);
  };
}

/** @param {Document} doc @param {Node} origin @param {Event} event */
function record(doc, origin, event) {
  for (const log of doc.querySelectorAll('[data-showcase-log]')) {
    const target = doc.querySelector(log.getAttribute('data-showcase-log') ?? '');
    const list = log.querySelector('[role="log"] > ol');
    if (!target?.contains(origin) || !list) continue;
    const item = doc.createElement('li');
    const name = doc.createElement('code');
    name.textContent = event.type;
    const detail = doc.createElement('code');
    detail.textContent = JSON.stringify('detail' in event ? (event.detail ?? null) : null);
    item.append(name, ' ', detail);
    list.prepend(item);
    list.children[MAX]?.remove();
    log.setAttribute('data-has-events', '');
  }
}
