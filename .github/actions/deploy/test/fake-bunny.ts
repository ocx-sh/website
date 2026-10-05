// Minimal fake of the Bunny storage HTTP API for the C-322 contract tests: holds a file tree,
// records requests, and throws on any DELETE that would remove a directory tree.
export interface Recorded {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | undefined;
  hasSignal: boolean;
  redirect: string | undefined;
}

export interface FakeOptions {
  zone: string;
  key: string;
  /** zone-relative file path → content */
  files: Record<string, string>;
  /** answer every request with this status and a body that echoes the AccessKey header */
  status?: 401 | 500;
  /** reject every request with this error */
  failWith?: Error;
  /** milliseconds each request takes, to make concurrency observable */
  latencyMs?: number;
  /** never answer; reject only when the request's abort signal fires */
  hang?: boolean;
}

export function fakeBunny(opts: FakeOptions) {
  const files = new Map(Object.entries(opts.files));
  const requests: Recorded[] = [];
  /** every DELETE that would remove a directory tree; tests assert it stays empty */
  const violations: string[] = [];
  let inflight = 0;
  let maxInflight = 0;
  const prefix = `/${opts.zone}/`;

  async function fetch(url: string, init: RequestInit = {}): Promise<Response> {
    const method = init.method ?? 'GET';
    const headers = { ...(init.headers as Record<string, string> | undefined) };
    requests.push({
      method,
      url,
      headers,
      body: typeof init.body === 'string' ? init.body : undefined,
      hasSignal: init.signal instanceof AbortSignal,
      redirect: init.redirect,
    });
    inflight++;
    maxInflight = Math.max(maxInflight, inflight);
    try {
      if (opts.latencyMs) await new Promise((r) => setTimeout(r, opts.latencyMs));
      if (opts.failWith) throw opts.failWith;
      if (opts.hang) {
        await new Promise((_, reject) => {
          const signal = init.signal;
          if (!signal) return; // no deadline: hangs forever, the test times out
          const abort = () => reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'));
          if (signal.aborted) abort();
          else signal.addEventListener('abort', abort, { once: true });
        });
      }
      const echo = `AccessKey: ${headers.AccessKey ?? ''}`;
      if (opts.status) return new Response(echo, { status: opts.status });
      if (headers.AccessKey !== opts.key) return new Response(echo, { status: 401 });
      const path = new URL(url).pathname;
      if (!path.startsWith(prefix)) return new Response('wrong zone', { status: 404 });
      const rel = path.slice(prefix.length);
      if (method === 'GET' && (rel === '' || rel.endsWith('/'))) return list(rel);
      if (method === 'PUT') {
        files.set(rel, typeof init.body === 'string' ? init.body : Buffer.from(init.body as Uint8Array).toString());
        return new Response('{}', { status: 201 });
      }
      if (method === 'DELETE') {
        if (rel.endsWith('/') || !files.has(rel)) {
          violations.push(url);
          throw new Error(`fake bunny: DELETE would remove a tree: ${url}`);
        }
        files.delete(rel);
        return new Response('{}', { status: 200 });
      }
      return new Response('unsupported', { status: 400 });
    } finally {
      inflight--;
    }
  }

  function list(dir: string): Response {
    const entries = new Map<string, boolean>();
    for (const file of files.keys()) {
      if (!file.startsWith(dir)) continue;
      const [head, ...rest] = file.slice(dir.length).split('/');
      if (head) entries.set(head, rest.length > 0);
    }
    const body = [...entries].map(([ObjectName, IsDirectory]) => ({
      Path: `${prefix}${dir}`,
      ObjectName,
      IsDirectory,
    }));
    return new Response(JSON.stringify(body), { status: 200 });
  }

  return {
    fetch,
    requests,
    violations,
    files,
    get maxInflight() {
      return maxInflight;
    },
  };
}
