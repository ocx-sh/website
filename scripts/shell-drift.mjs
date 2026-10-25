/**
 * Drift alarm for the shared header (`/_shell/`): fetches one page per claim of `nav.json` from the live
 * site, reads the `data-nav-rev` its header was baked with, compares it to `/_shell/v1/current.json`, and
 * opens (or updates, never duplicates) one issue listing the stale sites. A page without `data-nav-rev`
 * (a pre-0.3.0 consumer) is stale. The scheduled `site.yml` calls it; `--dry-run` prints without writing.
 *
 * A page that cannot be judged (not HTML, not 200) is listed as unchecked and never opens an issue alone.
 */
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import nav from '../packages/theme/src/nav.json' with { type: 'json' };

export const ORIGIN = 'https://ocx.sh';
export const CURRENT = '/_shell/v1/current.json';
export const REV = /^[0-9a-f]{12}$/;
/** Hidden marker the issue is found by: the title can be edited, this cannot be mistaken for prose. */
export const MARKER = '<!-- ocx-shell-drift -->';
export const TITLE = 'Shared header drift: sites behind the live header';

/**
 * @typedef {object} Claim
 * @property {string} path
 * @property {string} repo
 */
/**
 * @typedef {object} Row
 * @property {string} path
 * @property {string} repo
 * @property {'ok' | 'stale' | 'missing' | 'unchecked'} state
 * @property {string} [rev] the rev the page carries
 * @property {string} [note] why a page is unchecked
 */
/**
 * @typedef {object} Report
 * @property {string} current rev in `current.json`
 * @property {Row[]} rows
 */

/** @param {string} html @returns {string | null} the first `data-nav-rev` value on the page */
export const parseRev = (html) => /\sdata-nav-rev="([^"]*)"/.exec(html)?.[1] ?? null;

/** @param {Response} res @returns {Promise<unknown>} */
const jsonOf = (res) => res.json().catch(() => null);

/**
 * @param {typeof fetch} get
 * @param {string} url
 * @returns {Promise<Response>} one retry, so a single dropped request is not drift
 */
async function fetchTwice(get, url) {
  const init = { signal: AbortSignal.timeout(15_000), headers: { 'user-agent': 'ocx-shell-drift' } };
  try {
    return await get(url, init);
  } catch {
    return await get(url, { ...init, signal: AbortSignal.timeout(15_000) });
  }
}

/**
 * @param {Claim[]} claims
 * @param {typeof fetch} [get]
 * @returns {Promise<Report>} throws when `current.json` is unreadable: nothing can be judged without it
 */
export async function check(claims, get = fetch) {
  const res = await fetchTwice(get, `${ORIGIN}${CURRENT}`);
  const doc = /** @type {{ v?: unknown, rev?: unknown } | null} */ (res.ok ? await jsonOf(res) : null) ?? {};
  if (doc.v !== 1 || typeof doc.rev !== 'string' || !REV.test(doc.rev))
    throw new Error(`${ORIGIN}${CURRENT}: HTTP ${res.status}, not {"v":1,"rev":"<12 hex>"}`);
  const current = doc.rev;
  /** @type {Row[]} */
  const rows = [];
  for (const { path, repo } of claims) {
    /** @param {Row['state']} state @param {Partial<Row>} [more] @returns {Row} */
    const row = (state, more) => ({ path, repo, state, ...more });
    try {
      const page = await fetchTwice(get, `${ORIGIN}${path}`);
      if (!page.ok) rows.push(row('unchecked', { note: `HTTP ${page.status}` }));
      else if (!(page.headers.get('content-type') ?? '').includes('text/html'))
        rows.push(row('unchecked', { note: 'not an HTML page' }));
      else {
        const rev = parseRev(await page.text());
        if (rev === null) rows.push(row('missing'));
        else rows.push(row(rev === current ? 'ok' : 'stale', { rev }));
      }
    } catch (err) {
      rows.push(row('unchecked', { note: err instanceof Error ? err.message : String(err) }));
    }
  }
  return { current, rows };
}

/** @param {Report} report @returns {Row[]} */
export const staleOf = ({ rows }) => rows.filter((r) => r.state === 'stale' || r.state === 'missing');

/**
 * Deterministic: no timestamps, so an unchanged drift leaves the issue untouched.
 * @param {Report} report
 * @returns {{ title: string, body: string }}
 */
export function renderIssue(report) {
  const stale = staleOf(report);
  const unchecked = report.rows.filter((r) => r.state === 'unchecked');
  const lines = [
    MARKER,
    `The live header is \`${report.current}\` (\`${ORIGIN}${CURRENT}\`). These sites bake a different one or none:`,
    '',
    '| Path | Repo | Baked rev |',
    '| --- | --- | --- |',
    ...stale.map((r) => `| \`${r.path}\` | ${r.repo} | ${r.rev ? `\`${r.rev}\`` : 'none (before theme 0.3.0)'} |`),
    '',
    'JS visitors already get the live nav from `/_shell/`. No-JS visitors, crawlers and any CSS or markup change need the repo to bump `@ocx-sh/theme` and redeploy.',
  ];
  if (unchecked.length > 0)
    lines.push('', 'Not checked:', ...unchecked.map((r) => `- \`${r.path}\` (${r.repo}): ${r.note}`));
  lines.push('', 'This issue is kept current by the daily Site workflow and closes itself when every site matches.');
  return { title: TITLE, body: lines.join('\n') };
}

/**
 * @typedef {(method: string, path: string, body?: unknown) => Promise<unknown>} Api GitHub REST, repo-relative path
 */

/**
 * Opens, updates or closes the one drift issue. Returns what it did.
 * @param {Report} report
 * @param {Api} api
 * @returns {Promise<string>}
 */
export async function sync(report, api) {
  const open = /** @type {{ number: number, body?: string | null, title: string, pull_request?: unknown }[]} */ (
    await api('GET', '/issues?state=open&per_page=100')
  );
  const existing = open.find((i) => !i.pull_request && i.body?.includes(MARKER));
  if (staleOf(report).length === 0) {
    if (!existing) return 'in sync, no issue open';
    await api('POST', `/issues/${existing.number}/comments`, { body: 'Every site bakes the live header. Closing.' });
    await api('PATCH', `/issues/${existing.number}`, { state: 'closed', state_reason: 'completed' });
    return `in sync, closed #${existing.number}`;
  }
  const issue = renderIssue(report);
  if (!existing) {
    const made = /** @type {{ number: number }} */ (await api('POST', '/issues', issue));
    return `opened #${made.number}`;
  }
  if (existing.body === issue.body && existing.title === issue.title) return `#${existing.number} already current`;
  await api('PATCH', `/issues/${existing.number}`, issue);
  return `updated #${existing.number}`;
}

/** @param {string} repo `owner/name` @param {string} token @returns {Api} */
export const githubApi = (repo, token) => async (method, path, body) => {
  const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'ocx-shell-drift',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status}`);
  return jsonOf(res);
};

/** @param {string[]} argv @param {Record<string, string | undefined>} env @returns {Promise<number>} exit code */
export async function main(argv, env) {
  const { values } = parseArgs({ args: argv, options: { 'dry-run': { type: 'boolean' } } });
  const report = await check(nav.claims);
  for (const r of report.rows) console.log(`${r.state.padEnd(9)} ${r.path} ${r.rev ?? r.note ?? ''}`.trimEnd());
  console.log(`live ${report.current}; ${staleOf(report).length} stale`);
  if (values['dry-run']) return 0;
  if (!env['GITHUB_TOKEN'] || !env['GITHUB_REPOSITORY'])
    throw new Error('GITHUB_TOKEN and GITHUB_REPOSITORY are required');
  console.log(await sync(report, githubApi(env['GITHUB_REPOSITORY'], env['GITHUB_TOKEN'])));
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2), process.env).then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    },
  );
}
