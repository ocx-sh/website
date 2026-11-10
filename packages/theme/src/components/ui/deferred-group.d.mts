/**
 * A sidebar group Sidebar.astro left empty (`data-defer`, the key of its fragment under the sidebar's `data-frag`)
 * gets its links when its fill runs (a touch of the group, or its opening), so they are there when it opens (groups inside
 * them are plain lists). Shared by the sidebar controller and the Zag collapsible; imports no Zag. A failed load leaves one "All pages" link
 * in the group and the next open fetches again.
 * @param {HTMLElement} root
 */
export function fillDeferred(root: HTMLElement): () => void;
