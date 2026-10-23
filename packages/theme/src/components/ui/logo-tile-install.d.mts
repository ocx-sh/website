/**
 * Listen for every logo image on the page and settle those that already finished. Idempotent;
 * LogoTile.astro calls it from its page script, a consumer that clones tiles in later needs
 * nothing more.
 */
export function install(): void;
