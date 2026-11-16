// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The OCX Authors

// Hand-made glossary rows the matcher and plugin tests share: one term per rule under test.
import type { GlossaryTerm } from '../src/glossary/types.mjs';

export const row = (id: string, variants: string[], extra: Partial<GlossaryTerm> = {}): GlossaryTerm => ({
  id,
  term: id,
  variants,
  definition: `The ${id}.`,
  learnMore: 'a/',
  category: 'x',
  ...extra,
});

export const TERMS: GlossaryTerm[] = [
  row('package', ['package', 'packages'], { except: ['package manager', 'package managers'] }),
  row('index', ['index', 'indexes']),
  row('image-index', ['image index', 'OCI image index']),
  row('platform', ['platform', 'platforms']),
  row('ocx-home', ['OCX home']),
  row('set', ['SET', 'Signed Entry Timestamp']),
  row('object-store', ['object store'], { avoid: ['package store', 'three-tier CAS'] }),
];
