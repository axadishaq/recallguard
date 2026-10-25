// Data layer. Agents only ever speak SQL to this interface. In live mode the
// SQL runs on Zetaris (which federates the pharmacy inventory file and the
// openFDA tables); in SAMPLE_MODE the same SQL runs on a local engine loaded
// from the cached files, so the agents behave identically offline.

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import alasql from "alasql";
import { config } from "../config.ts";
import type { Trace } from "../trace.ts";

export type Row = Record<string, any>;

export const TABLES = ["inventory", "fda_ndc", "fda_recalls", "fda_recall_ndc"] as const;
export type TableName = (typeof TABLES)[number];

export interface DataLayer {
  readonly name: string;
  table(name: TableName): string;
  query(sql: string, agent: string, purpose: string): Promise<Row[]>;
}

abstract class TracedLayer implements DataLayer {
  abstract readonly name: string;
  constructor(protected trace: Trace) {}
  abstract table(name: TableName): string;
  protected abstract run(sql: string): Promise<Row[]>;

  async query(sql: string, agent: string, purpose: string): Promise<Row[]> {
    const started = Date.now();
    const rows = await this.run(sql);
    this.trace.log(agent, "sql", `${purpose} -> ${rows.length} rows (${this.name}, ${Date.now() - started} ms)`, {
      data: { sql: sql.replace(/\s+/g, " ").trim() },
    });
    return rows;
  }
}

export class LocalSqlLayer extends TracedLayer {
  readonly name = "local-sample";
  private db: any;

  constructor(trace: Trace, dataDir = config.dataDir) {
    super(trace);
    this.db = new alasql.Database();
    for (const t of TABLES) {
      const rows = JSON.parse(fs.readFileSync(path.join(dataDir, `${t}.json`), "utf-8"));
      this.db.exec(`CREATE TABLE ${t}`);
      this.db.tables[t].data = rows;
    }
  }

  table(name: TableName): string {
    return name;
  }

  protected async run(sql: string): Promise<Row[]> {
    return this.db.exec(sql) as Row[];
  }
}

// Zetaris REST SQL API: POST /query/sql/start, GET /query/sql/page, DELETE /query/sql/close.
export class ZetarisLayer extends TracedLayer {
  readonly name = "zetaris";
  private token?: string;

  table(name: TableName): string {
    return `${config.zetaris.database}.${name}`;
  }

  private headers(): Record<string, string> {
    return { "X-Request-ID": randomUUID(), "X-Org-ID": config.zetaris.orgId, "Content-Type": "application/json" };
  }

  private async login(): Promise<string> {
    if (this.token) return this.token;
    const basic = Buffer.from(`${config.zetaris.user}:${config.zetaris.password}`).toString("base64");
    const res = await fetch(`${config.zetaris.baseUrl}/api/v1.0/auth/login`, {
      headers: { ...this.headers(), Authorization: `Basic ${basic}` },
      signal: AbortSignal.timeout(config.zetaris.timeoutMs),
    });
    if (!res.ok) throw new Error(`Zetaris login failed: HTTP ${res.status} ${await res.text()}`);
    this.token = ((await res.json()) as { idToken: string }).idToken;
    return this.token;
  }

  protected async run(sql: string): Promise<Row[]> {
    const token = await this.login();
    const auth = { ...this.headers(), Authorization: `Bearer ${token}` };
    const signal = () => AbortSignal.timeout(config.zetaris.timeoutMs);
    const start = await fetch(`${config.zetaris.baseUrl}/api/v1.0/query/sql/start`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ select: sql, pageLimit: 100 }),
      signal: signal(),
    });
    if (!start.ok) throw new Error(`Zetaris query failed: HTTP ${start.status} ${await start.text()}`);
    const first = (await start.json()) as { records?: Row[]; totalPages: number; queryToken: string };
    const rows = [...(first.records ?? [])];
    try {
      for (let page = 2; page <= Math.min(first.totalPages, 50); page++) {
        const q = new URLSearchParams({ queryToken: first.queryToken, pageLimit: "100", pageNumber: String(page) });
        const res = await fetch(`${config.zetaris.baseUrl}/api/v1.0/query/sql/page?${q}`, { headers: auth, signal: signal() });
        if (!res.ok) throw new Error(`Zetaris page ${page} failed: HTTP ${res.status}`);
        rows.push(...(((await res.json()) as { records?: Row[] }).records ?? []));
      }
    } finally {
      await fetch(`${config.zetaris.baseUrl}/api/v1.0/query/sql/close/${first.queryToken}`, {
        method: "DELETE",
        headers: auth,
        signal: signal(),
      }).catch(() => undefined);
    }
    return rows;
  }
}

// Live mode with graceful degradation: if Zetaris is unreachable the run
// continues on the cached sample and the trace says so.
export async function createDataLayer(trace: Trace): Promise<DataLayer> {
  if (config.sampleMode) {
    trace.log("data", "fallback", "SAMPLE_MODE=true: using cached openFDA + inventory sample in local SQL engine");
    return new LocalSqlLayer(trace);
  }
  const z = new ZetarisLayer(trace);
  try {
    await z.query(`SELECT COUNT(*) AS n FROM ${z.table("inventory")}`, "data", "Zetaris health check");
    return z;
  } catch (err) {
    trace.log("data", "fallback", `Zetaris unavailable (${(err as Error).message}); falling back to cached sample`);
    return new LocalSqlLayer(trace);
  }
}
