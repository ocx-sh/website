/**
 * Adds both sheets once and resolves when they have loaded. A rejected load is forgotten, so the next open tries again.
 * @returns {Promise<unknown>}
 */
export function loadSkin(): Promise<unknown>;
