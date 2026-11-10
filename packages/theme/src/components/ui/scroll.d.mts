/** Run a frame on the next animation frame, once however many scroll events come. */
export function schedule(): void;
/**
 * Drive `el` by scroll. `kind` is `progress`, `fade`, `reveal` or `stage`. Draws the current state on the next animation
 * frame, before the next paint (so the element never waits for the first scroll) and returns whether it tracks (no, under reduced motion).
 * @param {HTMLElement} el
 * @param {'progress' | 'fade' | 'reveal' | 'stage'} kind
 * @returns {boolean}
 */
export function track(el: HTMLElement, kind: "progress" | "fade" | "reveal" | "stage"): boolean;
export function ease(v: number): number;
export function pinProgress(top: number, height: number, vh: number, stick: number): number;
export function cardAt(p: number, i: number): {
    e: number;
    s: number;
};
export function finalAt(p: number): number;
export function revealAt(top: number, vh: number): number;
export function heroFade(sy: number, vh: number): number;
export function flyDistance(vw: number): number;
/**
 * `span` is measured on first use in a frame.
 */
export type View = {
    vh: number;
    vw: number;
    sy: number;
    readonly span: number;
};
export type Tracked = {
    el: Element;
    read: (v: View) => () => void;
};
