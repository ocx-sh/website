/**
 * When each line starts and the loop length. A command line types at `TYPE_MS` per character; the
 * output lines of a command all appear together after it.
 * @param {{ kind: 'command' | 'output', lines: number[] }[]} entries characters per line, by entry
 * @returns {{ lines: { at: number, chars: number, typed: boolean }[], total: number }}
 */
export function plan(entries: {
    kind: "command" | "output";
    lines: number[];
}[]): {
    lines: {
        at: number;
        chars: number;
        typed: boolean;
    }[];
    total: number;
};
/**
 * How much of a line shows `ms` into the loop: -1 not yet started, else the characters typed.
 * @param {{ at: number, chars: number, typed: boolean }} line
 * @param {number} ms
 * @returns {number}
 */
export function shown(line: {
    at: number;
    chars: number;
    typed: boolean;
}, ms: number): number;
/**
 * Start playing a ShellSession root. Returns the session `lazy.mjs` expects.
 * @param {HTMLElement} root `.ocx-shell-session[data-ocx-play]`
 * @returns {{ api: undefined, stop: () => void }}
 */
export function start(root: HTMLElement): {
    api: undefined;
    stop: () => void;
};
/** Milliseconds per typed character. */
export const TYPE_MS: 40;
