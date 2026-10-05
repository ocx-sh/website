// A `node:http` fake of the Bunny management API: holds pull zones (edge rules, hostnames) and
// storage zones, records every request, and replays scripted faults.
// ponytail: a hand-written subset of the documented API (only the routes the plan needs, no paging, an edge rule
// kept as sent), not a recorded one. Re-check its request and response shapes against the owner's recorded
// Bunny responses (infra/bunny/README.md, "Record a response") and feed the recorded bodies in as zone state;
// until then a green test proves the code against this fake, not against Bunny.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface Recorded {
  method: string;
  /** path and query, as sent */
  path: string;
  /** parsed JSON body, the raw text when it is not JSON, `undefined` when empty */
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
}

export interface EdgeRule {
  Guid: string;
  [field: string]: unknown;
}

export interface PullZone {
  Id: number;
  Name: string;
  Hostnames: { Id: number; Value: string; [field: string]: unknown }[];
  EdgeRules: EdgeRule[];
  [field: string]: unknown;
}

export interface StorageZone {
  Id: number;
  Name: string;
  Password: string;
  [field: string]: unknown;
}

/** One scripted reply. `hang` never answers; `body` may echo the key to prove redaction. */
export interface Fault {
  status?: number;
  body?: string;
  headers?: Record<string, string>;
  hang?: boolean;
}

export interface FakeApiOptions {
  /** the `AccessKey` the fake accepts; any other value gets 401 */
  key: string;
  pullZones?: PullZone[];
  storageZones?: StorageZone[];
  /** called after every request that was answered, with the state it left: invariant checks */
  afterRequest?: (state: FakeApi['state'], request: Recorded) => void;
}

export interface FakeApi {
  /** `http://127.0.0.1:<port>`, the client's `baseUrl` */
  url: string;
  requests: Recorded[];
  state: { pullZones: PullZone[]; storageZones: StorageZone[] };
  /** The next requests matching `method` and a path prefix get these faults, one each, in order. */
  fail(method: string, pathPrefix: string, ...faults: Fault[]): void;
  close(): Promise<void>;
}

/**
 * Edge rules in the order the edge evaluates them: by `OrderIndex` (a rule without one sorts last, in arrival
 * order), never by array position. An invariant check that reads the array order would pass a state the edge
 * routes differently.
 */
export function evaluationOrder<T extends EdgeRule>(rules: readonly T[]): T[] {
  const at = (r: T) => (typeof r.OrderIndex === 'number' ? r.OrderIndex : Infinity);
  return rules
    .map((rule, i) => ({ rule, i }))
    .sort((a, b) => at(a.rule) - at(b.rule) || a.i - b.i)
    .map(({ rule }) => rule);
}

const readBody = async (req: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const parse = (text: string): unknown => {
  if (text === '') return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

export async function fakeApi(opts: FakeApiOptions): Promise<FakeApi> {
  const state = { pullZones: opts.pullZones ?? [], storageZones: opts.storageZones ?? [] };
  const requests: Recorded[] = [];
  const faults: { method: string; prefix: string; queue: Fault[] }[] = [];
  let nextId = 1000;
  let nextGuid = 1;

  const send = (res: ServerResponse, status: number, json?: unknown, headers: Record<string, string> = {}) => {
    const text = json === undefined ? '' : JSON.stringify(json);
    res.writeHead(status, { 'content-type': 'application/json', ...headers });
    res.end(text);
  };

  /** The Bunny routes the plan needs; anything else is a 404. */
  const route = (method: string, path: string, raw: unknown, res: ServerResponse): void => {
    const body: Record<string, unknown> = isRecord(raw) ? raw : {};
    const zoneRe = /^\/pullzone\/(\d+)(?:\/(.*))?$/.exec(path);
    if (path === '/pullzone' && method === 'GET') return send(res, 200, state.pullZones);
    if (path === '/pullzone' && method === 'POST') {
      // Bunny gives every new pull zone its system hostname.
      const system = {
        Id: nextId++,
        Value: `${String(body.Name)}.b-cdn.net`,
        ForceSSL: false,
        HasCertificate: true,
        IsSystemHostname: true,
      };
      const zone: PullZone = { ...body, Name: String(body.Name), Id: nextId++, Hostnames: [system], EdgeRules: [] };
      state.pullZones.push(zone);
      return send(res, 201, zone);
    }
    if (zoneRe) {
      const zone = state.pullZones.find((z) => z.Id === Number(zoneRe[1]));
      if (!zone) return send(res, 404, { Message: 'pull zone not found' });
      const sub = zoneRe[2];
      if (sub === undefined && method === 'GET') return send(res, 200, zone);
      if (sub === undefined && method === 'POST') return send(res, 200, Object.assign(zone, body));
      if (sub === 'addHostname' && method === 'POST') {
        zone.Hostnames.push({ Id: nextId++, Value: String(body.Hostname) });
        return send(res, 204);
      }
      if (sub === 'purgeCache' && method === 'POST') return send(res, 204);
      if (sub === 'setForceSSL' && method === 'POST') {
        const host = zone.Hostnames.find((h) => h.Value === body.Hostname);
        if (!host) return send(res, 404, { Message: 'hostname not found' });
        Object.assign(host, { ForceSSL: body.ForceSSL });
        return send(res, 204);
      }
      if (sub === 'edgerules/addOrUpdate' && method === 'POST') {
        const guid = typeof body.Guid === 'string' && body.Guid !== '' ? body.Guid : undefined;
        const at = guid === undefined ? -1 : zone.EdgeRules.findIndex((r) => r.Guid === guid);
        const rule: EdgeRule = { ...body, Guid: guid ?? `rule-${nextGuid++}` };
        if (at >= 0) zone.EdgeRules[at] = rule;
        else zone.EdgeRules.push(rule);
        return send(res, 204);
      }
      const rule = /^edgerules\/(.+)$/.exec(sub ?? '');
      if (rule && method === 'DELETE') {
        const before = zone.EdgeRules.length;
        zone.EdgeRules = zone.EdgeRules.filter((r) => r.Guid !== rule[1]);
        return send(res, zone.EdgeRules.length < before ? 204 : 404);
      }
    }
    if (path === '/purge' && method === 'POST') return send(res, 204);
    if (path === '/storagezone' && method === 'GET') return send(res, 200, state.storageZones);
    if (path === '/storagezone' && method === 'POST') {
      const zone: StorageZone = { ...body, Name: String(body.Name), Id: nextId++, Password: `pw-${nextId}` };
      state.storageZones.push(zone);
      return send(res, 201, zone);
    }
    const storageRe = /^\/storagezone\/(\d+)$/.exec(path);
    if (storageRe) {
      const zone = state.storageZones.find((z) => z.Id === Number(storageRe[1]));
      if (!zone) return send(res, 404, { Message: 'storage zone not found' });
      if (method === 'GET') return send(res, 200, zone);
      if (method === 'POST') {
        Object.assign(zone, body);
        return send(res, 204);
      }
    }
    return send(res, 404, { Message: `no route ${method} ${path}` });
  };

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const method = req.method ?? 'GET';
    const path = req.url ?? '/';
    const text = await readBody(req);
    const recorded: Recorded = { method, path, body: parse(text), headers: { ...req.headers } };
    requests.push(recorded);

    const fault = faults
      .find((f) => f.method === method && path.startsWith(f.prefix) && f.queue.length > 0)
      ?.queue.shift();
    if (fault?.hang) return; // closed by `close()`
    if (fault) {
      res.writeHead(fault.status ?? 500, fault.headers ?? {});
      return void res.end(fault.body ?? '');
    }
    if (req.headers.accesskey !== opts.key) {
      // Echo the offered key, as a misbehaving gateway could: the client must still not log it.
      send(res, 401, { Message: `Unauthorized: ${String(req.headers.accesskey)}` });
    } else {
      route(method, path.split('?')[0]!, recorded.body, res);
    }
    opts.afterRequest?.(state, recorded);
  };

  const server: Server = createServer((req, res) => {
    void handle(req, res).catch(() => res.destroy());
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    state,
    fail: (method, prefix, ...queue) => void faults.push({ method, prefix, queue }),
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
