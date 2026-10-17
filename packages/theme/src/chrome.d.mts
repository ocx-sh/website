/** @typedef {{ open: boolean, setOpen: (open: boolean) => void }} Api */
/** @param {Document} doc */
export function mountChrome(doc: Document): void;
export type Api = {
    open: boolean;
    setOpen: (open: boolean) => void;
};
