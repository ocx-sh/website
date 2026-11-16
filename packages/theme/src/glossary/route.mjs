// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The OCX Authors

// The glossary's popover data, injected at `<base>glossary.json` when the `glossary` option is set:
// `{id: [term, definition]}`, fetched once by term-tip.mjs on the first hover or focus of a term.
import definitions from 'virtual:ocx-theme/glossary';

const body = JSON.stringify(definitions);

export const GET = () => new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
