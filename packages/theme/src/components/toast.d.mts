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
export function toast(title: string, options?: Omit<ToastDetail, "title"> | undefined, target?: EventTarget | undefined): string;
/**
 * @overload
 * @param {EventTarget} target
 * @param {ToastDetail} detail
 * @returns {string | undefined} `detail.id`, as given (this form generates none)
 */
export function toast(target: EventTarget, detail: ToastDetail): string | undefined;
export namespace toast {
    /**
     * Dismisses a toast by id, or every toast with no id.
     * @param {string} [id]
     * @param {EventTarget} [target]
     */
    function dismiss(id?: string, target?: EventTarget): undefined;
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
    function promise<T>(promise: Promise<T> | (() => Promise<T>), options: {
        loading: string;
        success: string | ((value: T) => string);
        error: string | ((err: unknown) => string);
    }, target?: EventTarget): Promise<T>;
}
/**
 * The title of a copy confirmation (C-180, C-182): "Copied <text>", text cut to 40 characters.
 * @param {string} text
 * @returns {string}
 */
export function copiedTitle(text: string): string;
export type ToastTone = "info" | "success" | "warning" | "error" | "loading";
export type ToastAction = {
    label: string;
    event: string;
};
/**
 * What a toast shows. Absent keys take defaults on a new toast (`tone` 'success', `duration`
 * 2500 ms) and are left as they are on an update by `id`. `persistent` or an `action` means no
 * auto-dismiss: a reader must have time to reach the action (WCAG 2.2.1). A 'loading' toast
 * persists until an update gives it another tone. `progress` (0–100) turns a 'loading' toast's
 * ring determinate, and an update by `id` moves it; on any other tone it is ignored.
 */
export type ToastDetail = {
    title: string;
    description?: string;
    tone?: ToastTone | "danger";
    duration?: number;
    persistent?: boolean;
    action?: ToastAction;
    progress?: number;
    id?: string;
};
