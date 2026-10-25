// Run trace: every agent decision, SQL query, model call and memory hit is
// recorded so judges (and pharmacists) can see how the output was reached.

import fs from "node:fs";
import path from "node:path";

export type TraceKind = "plan" | "sql" | "llm" | "decision" | "feedback" | "memory" | "escalation" | "fallback" | "error" | "output";

export interface TraceEvent {
  t: number;
  agent: string;
  kind: TraceKind;
  message: string;
  model?: string;
  data?: unknown;
}

export class Trace {
  readonly runId: string;
  readonly events: TraceEvent[] = [];
  private listeners: ((e: TraceEvent) => void)[] = [];
  private started = Date.now();

  constructor(runId?: string) {
    this.runId = runId ?? new Date().toISOString().replace(/[:.]/g, "-");
  }

  onEvent(fn: (e: TraceEvent) => void): void {
    this.listeners.push(fn);
  }

  log(agent: string, kind: TraceKind, message: string, extra: { model?: string; data?: unknown } = {}): void {
    const e: TraceEvent = { t: Date.now() - this.started, agent, kind, message, ...extra };
    this.events.push(e);
    for (const fn of this.listeners) fn(e);
  }

  save(dir: string): string {
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${this.runId}.jsonl`);
    fs.writeFileSync(file, this.events.map((e) => JSON.stringify(e)).join("\n") + "\n");
    return file;
  }
}
