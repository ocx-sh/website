/**
 * Row order and page slice for a view. Sorting is stable, so ties keep the source order.
 * @param {Record<string, string>[]} rows cell text per column key
 * @param {View} view
 * @returns {Arranged}
 */
export function arrange(rows: Record<string, string>[], { key, direction, query, page, pageSize, require }: View): Arranged;
/**
 * The status line under the table.
 * @param {number} count matching rows
 * @param {number} total all rows
 * @returns {string}
 */
export function summary(count: number, total: number): string;
/**
 * Paging hook from the page script: moves the nested Pagination to page 1 of `count` items.
 * @typedef {(count: number) => void} Pager
 */
/**
 * Makes the SSR table live: sort buttons, the filter field and pagination changes re-arrange the
 * existing rows in place. State lives on the root's `data-ocx-*` attributes, which the page script
 * also writes (`data-ocx-page`, from `ocx:pagination:change`) before this module loads.
 * @param {HTMLElement} root `[data-ocx-data-table]`
 * @param {Pager} [pager] absent when the table does not page
 */
export function bind(root: HTMLElement, pager?: Pager): void;
/**
 * Paging hook from the page script: moves the nested Pagination to page 1 of `count` items.
 */
export type Pager = (count: number) => void;
export type Direction = "ascending" | "descending";
export type View = {
    /**
     * column to sort by; none keeps the source order
     */
    key?: string;
    /**
     * default `ascending`
     */
    direction?: Direction;
    /**
     * case-insensitive substring over every cell
     */
    query?: string;
    /**
     * from 1, clamped into range
     */
    page?: number;
    /**
     * rows per page; none shows every match
     */
    pageSize?: number;
    /**
     * column keys whose cell must be non-empty (an external filter, ANDed)
     */
    require?: string[];
};
export type Arranged = {
    /**
     * indices of the matching rows, in display order
     */
    order: number[];
    /**
     * the slice of `order` on the current page
     */
    visible: number[];
    /**
     * the clamped current page
     */
    page: number;
    /**
     * page count, at least 1
     */
    pages: number;
};
