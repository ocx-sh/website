// Public toast API (D-Z12, C-181/C-182 exposed): a typed helper over the `ocx:toast` DOM event, so
// consumer code toasts without importing Zag. Ships on every page: this module stays Zag-free —
// the toaster (toaster.mjs) loads toast.zag.mjs lazily, on the first event.

/** @typedef {'info' | 'success' | 'warning' | 'error' | 'loading'} ToastTone */
/** @typedef {{ label: string, event: string }} ToastAction */
/**
 * What a toast shows. Absent keys take defaults on a new toast (`tone` 'success', `duration`
 * 2500 ms) and are left as they are on an update by `id`. `persistent` or an `action` means no
 * auto-dismiss: a reader must have time to reach the action (WCAG 2.2.1). A 'loading' toast
 * persists until an update gives it another tone. `progress` (0–100) turns a 'loading' toast's
 * ring determinate, and an update by `id` moves it; on any other tone it is ignored.
 * @typedef {{
 *   title: string,
 *   description?: string,
 *   tone?: ToastTone | 'danger',
 *   duration?: number,
 *   persistent?: boolean,
 *   action?: ToastAction,
 *   progress?: number,
 *   id?: string,
 * }} ToastDetail
 */

let counter = 0;
/** A same-page-unique id: `crypto.randomUUID` isn't guaranteed in every embed context. */
const nextId = () => `ocx-toast-${Date.now().toString(36)}-${(counter++).toString(36)}`;

/**
 * Shows a toast, or updates one already showing (pass its `id` back). Dispatches `ocx:toast`;
 * the page toaster (loaded on the first call, `installToaster`) reads it — this module never
 * imports Zag. Backward compatible with the original two-argument form, `toast(target, detail)`,
 * used internally by clipboard.zag.mjs.
 *
 * @overload
 * @param {string} title
 * @param {Omit<ToastDetail, 'title'>} [options]
 * @param {EventTarget} [target] dispatched from here (bubbles); default `document`. Pass an
 *   element inside a demo's `EventLog` container to have it show up there too.
 * @returns {string} the toast's id — pass it to `toast.dismiss` or back into `toast` to update it
 */
/**
 * @overload
 * @param {EventTarget} target
 * @param {ToastDetail} detail
 * @returns {string | undefined} `detail.id`, as given (this form generates none)
 */
/** @param {string | EventTarget} a @param {ToastDetail | Omit<ToastDetail, 'title'>} [b] @param {EventTarget} [c] */
export function toast(a, b, c) {
  const isTarget = typeof a === 'object' && typeof (/** @type {EventTarget} */ (a).dispatchEvent) === 'function';
  // Legacy two-argument form: the detail goes through byte-for-byte, id included (the original
  // contract never had one; store.create still assigns its own when none is given).
  if (isTarget) {
    const detail = /** @type {ToastDetail} */ (b);
    /** @type {EventTarget} */ (a).dispatchEvent(new CustomEvent('ocx:toast', { detail, bubbles: true }));
    return detail.id;
  }
  const detail = /** @type {ToastDetail} */ ({ title: /** @type {string} */ (a), ...b });
  const id = detail.id ?? nextId();
  (c ?? document).dispatchEvent(new CustomEvent('ocx:toast', { detail: { ...detail, id }, bubbles: true }));
  return id;
}

/**
 * Dismisses a toast by id, or every toast with no id.
 * @param {string} [id]
 * @param {EventTarget} [target]
 */
toast.dismiss = (id, target = document) =>
  void target.dispatchEvent(new CustomEvent('ocx:toast:dismiss', { detail: { id }, bubbles: true }));

/**
 * A loading toast that resolves in place to success or error, like Zag's `store.promise`.
 * @template T
 * @param {Promise<T> | (() => Promise<T>)} promise
 * @param {{
 *   loading: string,
 *   success: string | ((value: T) => string),
 *   error: string | ((err: unknown) => string),
 * }} options
 * @param {EventTarget} [target]
 * @returns {Promise<T>}
 */
toast.promise = (promise, options, target = document) => {
  const id = toast(options.loading, { tone: 'loading', persistent: true }, target);
  return (typeof promise === 'function' ? promise() : promise).then(
    (value) => {
      toast(
        typeof options.success === 'function' ? options.success(value) : options.success,
        { id, tone: 'success' },
        target,
      );
      return value;
    },
    (err) => {
      toast(typeof options.error === 'function' ? options.error(err) : options.error, { id, tone: 'error' }, target);
      throw err;
    },
  );
};

/**
 * The title of a copy confirmation (C-180, C-182): "Copied <text>", text cut to 40 characters.
 * @param {string} text
 * @returns {string}
 */
export function copiedTitle(text) {
  return `Copied ${text.length > 40 ? `${text.slice(0, 39)}…` : text}`;
}
