// `task bunny:onboard -- <repo> | --preview <site>`: ensures the repo's storage zone, then hands the zone password
// to the GitHub secret the deploy action reads. CI holds per-zone storage keys only; the account key never
// leaves this machine.
import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import nav from '@ocx-sh/theme/nav.json' with { type: 'json' };
import { secretName, previewZone, findSite } from '../../scripts/previews/sites.mjs';
import { EXIT, RefusalError, createClient, findByName } from './api.mjs';
import { REGION, ROOT_REPO, storageZoneName } from './zones.mjs';

const SECRET = 'BUNNY_STORAGE_KEY';
const GH_TIMEOUT_MS = 30_000;
// ponytail: `Custom404FilePath` and the leading slash are the documented storage-zone field; the deploy action
// uploads `404.html` to `bunnycdn_errors/404.html`. Re-check both against a recorded storage-zone
// response (infra/bunny/README.md, "Record a response"): a wrong path leaves the zone without its 404 page.
const NOT_FOUND_PATH = '/bunnycdn_errors/404.html';

/**
 * @typedef {object} MainOptions
 * @property {string[]} argv
 * @property {Record<string, string | undefined>} env
 * @property {(text: string) => void} out the result
 * @property {(text: string) => void} err messages about the run
 * @property {typeof globalThis.fetch} [fetch] injected in tests
 * @property {string} [baseUrl] API origin, injected in tests
 */

/**
 * Runs `gh` with `input` on stdin. The key is only ever `input`: never an argument, never a file.
 * @param {string[]} args
 * @param {Record<string, string | undefined>} env
 * @param {string} [input]
 * @returns {Promise<{ code: number | null, stdout: string, stderr: string }>} rejects when `gh` cannot start
 */
function gh(args, env, input = '') {
  return new Promise((resolve, reject) => {
    const child = spawn('gh', args, {
      env: /** @type {NodeJS.ProcessEnv} */ (env),
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: GH_TIMEOUT_MS,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.stdin.on('error', () => {}); // gh may exit before reading: the exit code says so
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}

/**
 * What the owner runs to give an environment its branch policy: the call and the cutover runbook step that
 * holds the whole sequence (the policy only restricts once `main` is added to it).
 * @param {string} base `repos/<repo>/environments/<name>`
 * @returns {string}
 */
const CREATE_HINT = (base) =>
  `create it with: gh api -X PUT ${base} -F 'deployment_branch_policy[protected_branches]=false' -F 'deployment_branch_policy[custom_branch_policies]=true' ` +
  `then gh api -X POST ${base}/deployment-branches -f name=main -f type=branch (infra/cutover/README.md, "create the GitHub environments")`;

/**
 * @param {string} body stdout of `gh api repos/<repo>/environments/<name>`
 * @returns {boolean} whether the environment restricts which branches may deploy
 */
function hasBranchPolicy(body) {
  try {
    const env = /** @type {unknown} */ (JSON.parse(body));
    const policy =
      typeof env === 'object' && env !== null && 'deployment_branch_policy' in env
        ? env.deployment_branch_policy
        : null;
    return typeof policy === 'object' && policy !== null;
  } catch {
    return false;
  }
}

/**
 * @param {string[]} argv
 * @returns {{ repo: string, zone: string, secret: string, environment: string, secretRepo: string, preview: boolean }}
 */
function target(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { preview: { type: 'string' } },
    allowPositionals: true,
  });
  if (values.preview !== undefined) {
    if (positionals.length > 0) throw new Error('give a repo or --preview <site>, not both');
    const site = findSite(values.preview);
    return {
      repo: site.repo,
      zone: previewZone(site),
      secret: secretName(site),
      environment: 'previews',
      secretRepo: ROOT_REPO,
      preview: true,
    };
  }
  if (positionals.length > 1) throw new Error('give one repo');
  const given = positionals[0] ?? ROOT_REPO;
  const repo = given.includes('/') ? given : `ocx-sh/${given}`;
  return { repo, zone: storageZoneName(repo), secret: SECRET, environment: 'ocx.sh', secretRepo: repo, preview: false };
}

/**
 * Onboards one repo or preview site. Exit 0 on success, 1 on a refusal (CI, empty key, no claim, `gh` or its
 * environment missing, API failure), 2 on bad arguments. A missing `gh` or environment ends the run before
 * the first Bunny request. The key is neither printed nor written.
 * @param {MainOptions} options
 * @returns {Promise<number>}
 */
export async function main({ argv, env, out, err, fetch, baseUrl }) {
  /** @type {ReturnType<typeof target>} */
  let t;
  try {
    t = target(argv);
  } catch (e) {
    err(`${e instanceof Error ? e.message : String(e)}\nusage: onboard.mjs [<repo>] | --preview <site>\n`);
    return EXIT.usage;
  }

  /** @type {string} */
  let password = '';
  /** @param {string} text */
  const masked = (text) => (password ? text.split(password).join('***') : text);
  try {
    if (!t.preview && !nav.claims.some((c) => c.repo === t.repo)) {
      throw new RefusalError(`${t.repo} owns no claim in nav.json: add its claim first`);
    }
    const client = createClient(env, { ...(fetch ? { fetch } : {}), ...(baseUrl ? { baseUrl } : {}) });

    // gh never sees the account key.
    const ghEnv = { ...env, BUNNY_API_KEY: undefined };
    const base = `repos/${t.secretRepo}/environments/${t.environment}`;
    const probe = await gh(['api', base], ghEnv).catch(() => undefined);
    if (probe?.code !== 0) {
      throw new RefusalError(
        `environment "${t.environment}" of ${t.secretRepo} is not reachable through gh (installed and logged in?); ${CREATE_HINT(base)}`,
      );
    }
    // The deploy key goes into this environment: without a branch policy any branch's workflow could read it.
    if (!hasBranchPolicy(probe.stdout)) {
      throw new RefusalError(
        `environment "${t.environment}" of ${t.secretRepo} has no deployment branch policy, so any branch could read the key; ${CREATE_HINT(base)}`,
      );
    }

    let zone = findByName(await client.get('/storagezone'), t.zone);
    if (!zone) {
      zone = /** @type {Record<string, unknown>} */ (
        await client.post('/storagezone', {
          Name: t.zone,
          Region: REGION.primary,
          ReplicationRegions: REGION.replication,
        })
      );
      out(`created storage zone ${t.zone}\n`);
    }
    if (typeof zone.Id !== 'number') throw new Error(`storage zone ${t.zone} response has no Id`);
    const id = String(zone.Id);
    if (typeof zone.Password !== 'string' || zone.Password === '')
      throw new Error(`storage zone ${t.zone} response has no password`);
    password = zone.Password;

    if (zone.Custom404FilePath !== NOT_FOUND_PATH) {
      await client.post(`/storagezone/${id}`, { Custom404FilePath: NOT_FOUND_PATH });
      const back = /** @type {Record<string, unknown> | null} */ (await client.get(`/storagezone/${id}`));
      if (back?.Custom404FilePath !== NOT_FOUND_PATH)
        throw new RefusalError(`${t.zone}: Custom404FilePath read back as ${JSON.stringify(back?.Custom404FilePath)}`);
      out(`${t.zone}: 404 path set\n`);
    }

    const set = await gh(['secret', 'set', t.secret, '--env', t.environment, '--repo', t.secretRepo], ghEnv, password);
    if (set.code !== 0) throw new RefusalError(`gh secret set ${t.secret} failed: ${set.stderr.trim()}`);
    out(`${t.zone}: secret ${t.secret} set in ${t.secretRepo} environment ${t.environment}\n`);
    return EXIT.ok;
  } catch (e) {
    err(`${masked(e instanceof Error ? e.message : String(e))}\n`);
    return EXIT.refused;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await main({
    argv: process.argv.slice(2),
    env: process.env,
    out: (t) => process.stdout.write(t),
    err: (t) => process.stderr.write(t),
  });
}
