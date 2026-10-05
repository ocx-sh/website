// C-318 fixture guard: a recorded Bunny response under fixtures/ must never carry a live secret.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const FIXTURES = new URL('./fixtures/', import.meta.url).pathname;
const SECRET_NAME = /(key|secret|password|token)$/i;
// Known-safe secret-named fields, each justified. Empty: every recorded field of that shape is a secret.
const ALLOWED = new Set<string>();

/** Paths of every non-empty secret-named field in a parsed JSON value; array elements inherit the field name. */
function leaks(value: unknown, name: string, path: string): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => leaks(v, name, `${path}[${i}]`));
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => leaks(v, k, `${path}.${k}`));
  }
  const secret = SECRET_NAME.test(name) && !ALLOWED.has(name);
  return secret && value !== '' && value !== null ? [path] : [];
}

/** Violations under `dir`: secret-named fields that are not empty, and files the guard cannot read. */
function scan(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const file = join(dir, e.name);
    if (e.isDirectory()) return scan(file);
    if (e.name === '.keep') return [];
    if (!e.name.endsWith('.json')) return [`${file}: not JSON, the guard cannot read it`];
    return leaks(JSON.parse(readFileSync(file, 'utf8')) as unknown, '', file);
  });
}

describe('fixture guard', () => {
  it('finds no non-empty secret-named field under infra/bunny/fixtures/', () => {
    expect(scan(FIXTURES)).toEqual([]);
  });

  it('fails a planted ZoneSecurityKey, however deeply nested', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fixture-guard-'));
    mkdirSync(join(dir, 'sub'));
    writeFileSync(
      join(dir, 'sub', 'zone.json'),
      JSON.stringify({ Hostnames: [{ Edge: { ZoneSecurityKey: 'live' } }] }),
    );
    expect(scan(dir)).toEqual([join(dir, 'sub', 'zone.json') + '.Hostnames[0].Edge.ZoneSecurityKey']);
  });

  it('passes emptied secrets and keeps looking past names that merely contain "key"', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fixture-guard-'));
    writeFileSync(join(dir, 'zone.json'), JSON.stringify({ AccessKey: '', Password: '', KeyName: 'x', Keys: ['x'] }));
    expect(scan(dir)).toEqual([]);
  });

  it('flags a non-empty secret-named array and a non-JSON file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fixture-guard-'));
    writeFileSync(join(dir, 'a.json'), JSON.stringify({ ApiTokens: [], Tokens: ['t'], LogForwardingToken: ['t'] }));
    writeFileSync(join(dir, 'b.txt'), '');
    expect(scan(dir)).toHaveLength(2);
  });
});
