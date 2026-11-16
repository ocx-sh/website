// Kept apart from cast-size.mjs, which reads files at build: terminal.mjs runs in the browser.

/**
 * Smallest font (px) the player may fit to the frame width. Below it the terminal keeps this size and scrolls
 * sideways inside its frame. The theme's smallest type step is `--ocx-text-2xs` (10.5px); the shipped 120-column
 * terminal on a desktop docs page fits at 10.3px, so the floor is that step rounded down: nothing above it changes.
 */
export const TERMINAL_FLOOR_PX = 10;
