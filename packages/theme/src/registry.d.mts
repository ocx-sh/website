/**
 * Every rule violation in `nav` (C-002…C-006); empty when valid.
 * @param {Nav} nav shape-valid registry
 * @returns {Problem[]}
 */
export function validate(nav: Nav): Problem[];
/**
 * The claim owning `path`: the longest claim path that prefixes it (`/` matches everything).
 * A path without its trailing slash matches its claim too (`/docs` → `/docs/`, F2).
 * @param {Nav} nav
 * @param {string} path
 * @returns {Claim | undefined}
 */
export function claimFor(nav: Nav, path: string): Claim | undefined;
/**
 * Every claim deployed by `repo`, in `claims` order.
 * @param {Nav} nav
 * @param {string} repo `ocx-sh/<name>`
 * @returns {Claim[]}
 */
export function claimsOf(nav: Nav, repo: string): Claim[];
/**
 * The Bunny storage zone of `repo` (R7): `ocx-sh/rules_ocx` → `sh-ocx-rules-ocx`.
 * @param {string} repo
 * @returns {string}
 */
export function zoneName(repo: string): string;
/**
 * Every `search: true` claim except `ownPath`, in `claims` order, labelled by the
 * entry, section, hub or action linking to it, else the brand wordmark.
 * @param {Nav} nav
 * @param {string} ownPath claim path of the calling site
 * @returns {MergeTarget[]}
 */
export function mergeTargets(nav: Nav, ownPath: string): MergeTarget[];
/** @typedef {{ wordmark: string, href: string }} Brand */
/** @typedef {{ id: string, label: string, href: string }} LinkSection */
/** @typedef {{ id: string, label: string, hubs: string[] }} MenuSection */
/** @typedef {LinkSection | MenuSection} Section */
/** @typedef {{ id: string, label: string }} Category */
/**
 * @typedef {object} Hub
 * @property {string} id
 * @property {string} label
 * @property {string} href mount point, a claim path
 * @property {string} blurb default text of the menu detail strip
 * @property {string} all label of the "see all" link
 * @property {boolean} [pinned] rail entry pinned to the menu's bottom; the last hub of its section
 * @property {Category[]} categories at most 4
 */
/**
 * @typedef {object} Claim
 * @property {string} path path prefix the repo deploys, per the §1.1 grammar
 * @property {string} repo `ocx-sh/<name>`
 * @property {boolean} search ships its own Pagefind index
 */
/**
 * @typedef {object} Entry
 * @property {string} id unique per hub
 * @property {string} hub
 * @property {string} category
 * @property {string} label
 * @property {string} meta short mono tag
 * @property {string} desc at most 60 chars
 * @property {string} [href] a claim path, a path under a claim other than `/`, or an `https:` URL; absent iff planned
 * @property {boolean} [planned]
 */
/** @typedef {{ id: string, label: string, href: string, kind: string }} Action */
/** @typedef {{ label: string, href: string }} FooterLink */
/**
 * @typedef {object} Nav
 * @property {string} [$schema]
 * @property {number} version always 4 (schema const)
 * @property {Brand} brand
 * @property {Section[]} sections
 * @property {Hub[]} hubs
 * @property {Claim[]} claims
 * @property {Entry[]} entries
 * @property {Action[]} actions
 * @property {FooterLink[]} footer
 */
/**
 * A rule violation. `at` locates it (`claims[3].path`); `message` names the rule (`R4: …`).
 * @typedef {{ at: string, message: string }} Problem
 */
/**
 * A search index to merge into the local Pagefind instance.
 * @typedef {{ path: string, label: string }} MergeTarget
 */
/** Directories the root claim `/` owns besides `/` itself and top-level files (R5). */
export const ROOT_DIRS: readonly ["/_astro/", "/pagefind/"];
export type Brand = {
    wordmark: string;
    href: string;
};
export type LinkSection = {
    id: string;
    label: string;
    href: string;
};
export type MenuSection = {
    id: string;
    label: string;
    hubs: string[];
};
export type Section = LinkSection | MenuSection;
export type Category = {
    id: string;
    label: string;
};
export type Hub = {
    id: string;
    label: string;
    /**
     * mount point, a claim path
     */
    href: string;
    /**
     * default text of the menu detail strip
     */
    blurb: string;
    /**
     * label of the "see all" link
     */
    all: string;
    /**
     * rail entry pinned to the menu's bottom; the last hub of its section
     */
    pinned?: boolean;
    /**
     * at most 4
     */
    categories: Category[];
};
export type Claim = {
    /**
     * path prefix the repo deploys, per the §1.1 grammar
     */
    path: string;
    /**
     * `ocx-sh/<name>`
     */
    repo: string;
    /**
     * ships its own Pagefind index
     */
    search: boolean;
};
export type Entry = {
    /**
     * unique per hub
     */
    id: string;
    hub: string;
    category: string;
    label: string;
    /**
     * short mono tag
     */
    meta: string;
    /**
     * at most 60 chars
     */
    desc: string;
    /**
     * a claim path, a path under a claim other than `/`, or an `https:` URL; absent iff planned
     */
    href?: string;
    planned?: boolean;
};
export type Action = {
    id: string;
    label: string;
    href: string;
    kind: string;
};
export type FooterLink = {
    label: string;
    href: string;
};
export type Nav = {
    $schema?: string;
    /**
     * always 4 (schema const)
     */
    version: number;
    brand: Brand;
    sections: Section[];
    hubs: Hub[];
    claims: Claim[];
    entries: Entry[];
    actions: Action[];
    footer: FooterLink[];
};
/**
 * A rule violation. `at` locates it (`claims[3].path`); `message` names the rule (`R4: …`).
 */
export type Problem = {
    at: string;
    message: string;
};
/**
 * A search index to merge into the local Pagefind instance.
 */
export type MergeTarget = {
    path: string;
    label: string;
};
