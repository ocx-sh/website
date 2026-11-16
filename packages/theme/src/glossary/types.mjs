// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The OCX Authors

/**
 * One glossary row (the shape `schema.json` describes).
 * @typedef {{
 *   id: string,
 *   term: string,
 *   variants: string[],
 *   definition: string,
 *   learnMore: string,
 *   category: string,
 *   avoid?: string[],
 *   except?: string[],
 *   excludePages?: string[],
 * }} GlossaryTerm
 */

/**
 * @typedef {{ id: string, text: string, start: number, end: number }} GlossaryHit
 *   a found form: the term it belongs to, the source text and its offsets in the searched string
 */

export {};
