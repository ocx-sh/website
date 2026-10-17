/**
 * Wire one rendered `.ocx-terminal` root: fetch its cast when it is seen or opened, and create the
 * player lazily: an open terminal on its first hover, focus, touch or start click (as it nears the
 * viewport only with `autoPlay`); a collapsed one (a Zag collapsible, C-142) on its first expand,
 * reported by `ocx:collapsible:change`.
 * @param {HTMLElement} root
 * @param {() => Promise<PlayerModule>} [loadPlayer] dynamic import of the player JS + CSS
 * @returns {void}
 */
export function mountTerminal(root: HTMLElement, loadPlayer?: () => Promise<PlayerModule>): void;
export function nextTerminalId(): string;
export function loadDefault(): Promise<PlayerModule>;
/**
 * Options handed to `AsciinemaPlayer.create`, serialised on the root as
 * `data-options` (JSON). `fit` is already mapped ('none' → false).
 */
export type PlayerOptions = {
    cols?: number;
    rows?: number;
    /**
     * initial autoplay (false whenever `src` is set, DOC-EX-15)
     */
    autoPlay: boolean;
    speed: number;
    idleTimeLimit: number;
    loop: boolean;
    fit: "width" | "height" | "both" | false;
};
/**
 * The subset of the asciinema-player instance Terminal drives.
 */
export type Player = {
    play: () => unknown;
    pause: () => unknown;
    seek: (pos: number) => unknown;
    getCurrentTime: () => Promise<number>;
    getDuration: () => Promise<number | undefined>;
    addEventListener: (name: string, cb: (data?: unknown) => void) => void;
    dispose: () => void;
};
/**
 * The asciinema-player module shape (`create` only).
 */
export type PlayerModule = {
    create: (src: {
        data: string;
    }, el: HTMLElement, opts: Record<string, unknown>) => Player;
};
