// C-035 contract: the action's manifest. action.yml is flat enough to read without a YAML parser.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = join(import.meta.dirname, '..');
const lines = readFileSync(join(dir, 'action.yml'), 'utf8').split('\n');

/** The lines nested under a top-level key. */
function section(name: string): string[] {
  const start = lines.findIndex((l) => l === `${name}:`);
  if (start < 0) return [];
  const out: string[] = [];
  for (const l of lines.slice(start + 1)) {
    if (l !== '' && !l.startsWith(' ') && !l.startsWith('#')) break;
    out.push(l);
  }
  return out;
}

/** The direct child keys (two-space indent) of a top-level key. */
const keys = (name: string) =>
  section(name)
    .map((l) => /^ {2}([\w-]+):/.exec(l)?.[1])
    .filter((k): k is string => k !== undefined);

const scalar = (name: string, key: string) =>
  section(name)
    .map((l) => new RegExp(`^ {2}${key}:\\s*(.+)$`).exec(l)?.[1]?.replace(/^['"]|['"]$/g, ''))
    .find((v) => v !== undefined);

describe('action.yml', () => {
  it('runs on node24 from index.mjs', () => {
    expect(scalar('runs', 'using')).toBe('node24');
    expect(scalar('runs', 'main')).toBe('index.mjs');
    expect(existsSync(join(dir, 'index.mjs'))).toBe(true);
  });

  it('has exactly the C-035 inputs', () => {
    expect(keys('inputs').sort()).toEqual(
      ['dist', 'dry-run', 'force-prune', 'path', 'preview', 'storage-host', 'storage-key'].sort(),
    );
  });

  it('has exactly the C-035 outputs', () => {
    expect(keys('outputs').sort()).toEqual(['deleted', 'uploaded', 'url']);
  });

  it('defaults the optional inputs the way the README documents them', () => {
    const body = section('inputs').join('\n');
    expect(body).toMatch(/storage-host:[\s\S]*?default:\s*['"]?storage\.bunnycdn\.com/);
    expect(body).toMatch(/dry-run:[\s\S]*?default:\s*['"]false['"]/);
  });
});

/** node: builtins, the action's own modules, and the repo modules it shares with the CLI. */
const ALLOWED_IMPORT =
  /^(node:|\.\/(deploy|storage)\.mjs$|(\.\.\/)+packages\/theme\/src\/(check\/|registry\.mjs$)|(\.\.\/)+scripts\/previews\/sites\.mjs$)/;

describe('zero dependencies', () => {
  it('has no package.json and no node_modules under the action directory', () => {
    expect(existsSync(join(dir, 'node_modules'))).toBe(false);
    const pkg = join(dir, 'package.json');
    if (existsSync(pkg)) {
      const json = JSON.parse(readFileSync(pkg, 'utf8')) as Record<string, unknown>;
      for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'])
        expect(json[field] ?? {}).toEqual({});
    }
  });

  it('imports only node: builtins and the allow-listed repo files', () => {
    for (const file of ['index.mjs', 'deploy.mjs', 'storage.mjs']) {
      const src = readFileSync(join(dir, file), 'utf8');
      const specs = [...src.matchAll(/^import\b[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1] ?? '');
      for (const spec of specs) expect(spec, `${file} imports ${spec}`).toMatch(ALLOWED_IMPORT);
    }
  });
});
