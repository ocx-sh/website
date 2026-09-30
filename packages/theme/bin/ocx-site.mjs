#!/usr/bin/env node
// `ocx-site check` CLI. Argv surface only — see src/check/index.mjs for the check logic.
// TS-CLI-01..03: one named code object, `run(argv)` returns a code, `process.exitCode` is
// set exactly once at the bottom — nothing else touches `process.exit`/`process.exitCode`.

import { parseArgs } from 'node:util';
import { existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import navJson from '../src/nav.json' with { type: 'json' };
import { check } from '../src/check/index.mjs';

export const EXIT = /** @type {const} */ ({ ok: 0, failure: 1, usage: 2 });

const USAGE = 'usage: ocx-site check [--dist <dir>] [--repo <owner/name>] [--path <p>]';

/** @type {(message: string) => typeof EXIT.usage} */
function usageError(message) {
  process.stderr.write(`${message}\n${USAGE}\n`);
  return EXIT.usage;
}

/** @type {(cmd: string, args: string[]) => string | undefined} */
function tryExec(cmd, args) {
  try {
    return execFileSync(cmd, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 10_000,
      maxBuffer: 1 << 20,
    }).trim();
  } catch {
    return undefined;
  }
}

/** @type {(url: string) => string | undefined} */
function repoFromRemote(url) {
  const m = /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(url);
  return m ? `${m[1]}/${m[2]}` : undefined;
}

/**
 * Parses `argv` (as in `process.argv.slice(2)`), runs the `check` subcommand, and returns
 * the exit code — see {@link EXIT}. Never touches `process`.
 * @param {string[]} argv
 * @returns {number}
 */
export function run(argv) {
  const [subcommand, ...rest] = argv;
  if (subcommand !== 'check')
    return usageError(subcommand ? `unknown subcommand "${subcommand}"` : 'missing subcommand');

  const options = /** @type {const} */ ({
    dist: { type: /** @type {const} */ ('string') },
    repo: { type: /** @type {const} */ ('string') },
    path: { type: /** @type {const} */ ('string') },
  });

  /** @type {ReturnType<typeof parseArgs<{ options: typeof options }>>} */
  let parsed;
  try {
    parsed = parseArgs({ args: rest, options, strict: true, allowPositionals: false });
  } catch (err) {
    return usageError(err instanceof Error ? err.message : String(err));
  }
  const { values } = parsed;

  const dist = values.dist ?? 'dist';
  if (!existsSync(dist) || !statSync(dist).isDirectory()) return usageError(`--dist "${dist}" is not a directory`);

  const repo =
    values.repo ??
    (process.env.GITHUB_REPOSITORY || repoFromRemote(tryExec('git', ['remote', 'get-url', 'origin']) ?? ''));
  if (!repo)
    return usageError(
      '--repo not given, GITHUB_REPOSITORY unset, and no "origin" remote resolves to a github.com repo',
    );

  // C-012 / claim-ownership validation lives in check() — pass --path through as given.
  const problems = check({ dist, nav: navJson, repo, path: values.path });
  for (const { file, problem } of problems) process.stdout.write(`${file}: ${problem}\n`);
  return problems.length > 0 ? EXIT.failure : EXIT.ok;
}

process.exitCode = run(process.argv.slice(2));
