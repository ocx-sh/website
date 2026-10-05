// Action entry point: reads `INPUT_*`, masks the key, runs `deploy`, writes the outputs and the
// step summary. The exit code is 0 on success, 1 on any failure.
import { appendFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { deploy } from './deploy.mjs';

/**
 * @typedef {object} RunIo
 * @property {(line: string) => void} [log] one stdout line, default `process.stdout`
 * @property {NonNullable<import('./storage.mjs').StorageClient['fetch']>} [fetch] injected in tests
 * @property {(ms: number) => Promise<void>} [sleep] injected in tests
 */

/** Workflow-command data escaping, so a value cannot end its own command. */
const escapeData = (/** @type {string} */ s) =>
  s.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');

/**
 * @param {Record<string, string | undefined>} env
 * @param {string} name
 * @returns {string}
 */
const input = (env, name) => (env[`INPUT_${name.toUpperCase()}`] ?? '').trim();

/**
 * @param {Record<string, string | undefined>} env
 * @param {string} name
 * @returns {boolean}
 */
function flag(env, name) {
  const v = input(env, name).toLowerCase();
  if (v === '' || v === 'false') return false;
  if (v === 'true') return true;
  throw new Error(`input ${name} must be "true" or "false", got ${JSON.stringify(v)}`);
}

/**
 * @param {Record<string, string | undefined>} env the process environment
 * @param {RunIo} [io]
 * @returns {Promise<number>} the exit code
 */
export async function run(env, io = {}) {
  const log = io.log ?? ((line) => void process.stdout.write(`${line}\n`));
  const key = input(env, 'storage-key');
  // First output of the run, before anything can print the key.
  if (key) log(`::add-mask::${escapeData(key)}`);
  try {
    const dist = input(env, 'dist');
    if (!dist) throw new Error('input dist is required');
    const repo = env.GITHUB_REPOSITORY ?? '';
    if (!repo) throw new Error('GITHUB_REPOSITORY is not set');
    /** @type {unknown} */
    const raw = JSON.parse(await readFile(new URL('../../../packages/theme/src/nav.json', import.meta.url), 'utf8'));
    const nav = /** @type {import('../../../packages/theme/src/registry.mjs').Nav} */ (raw);
    const started = Date.now();
    const path = input(env, 'path');
    const preview = input(env, 'preview');
    const result = await deploy({
      inputs: {
        dist,
        ...(path && { path }),
        dryRun: flag(env, 'dry-run'),
        ...(preview && { preview }),
        forcePrune: flag(env, 'force-prune'),
      },
      repo,
      nav,
      storage: {
        host: input(env, 'storage-host') || 'storage.bunnycdn.com',
        accessKey: key,
        ...(io.fetch && { fetch: io.fetch }),
      },
      log,
      ...(io.sleep && { sleep: io.sleep }),
    });
    if (env.GITHUB_OUTPUT) {
      await appendFile(
        env.GITHUB_OUTPUT,
        `url=${result.url}\nuploaded=${result.uploaded}\ndeleted=${result.deleted}\n`,
      );
    }
    if (env.GITHUB_STEP_SUMMARY) {
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      const counts = result.planned
        ? `dry run: would upload ${result.planned.uploads}, delete ${result.planned.deletes}`
        : `uploaded ${result.uploaded}, deleted ${result.deleted}`;
      await appendFile(env.GITHUB_STEP_SUMMARY, `### Deploy\n\n${result.url}\n\n${counts} in ${seconds} s\n`);
    }
    return 0;
  } catch (err) {
    let text = err instanceof Error ? err.message : String(err);
    if (key) text = text.split(key).join('***');
    log(`::error::${escapeData(text)}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await run(process.env);
}
