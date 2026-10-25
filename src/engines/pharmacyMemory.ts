// RecallGuard's use of the Meterless H-MEM engine: persistent memory of past
// recall checks and of the pharmacist's own resolutions, across sessions.
//
//   - every finding is mined into memory with the FDA recall as its source
//   - a pharmacist's "already handled" note is stored as a user_correction in
//     the long-term layer and suppresses repeat alerts in later sessions
//   - the Reporter receives H-MEM's ranked reinjection context in its prompt
//   - feedback on a memory adjusts its confidence (H-MEM trust layer)

import { HMEM } from "./hmem/index.ts";
import type { MemoryRecord, QueryResult } from "./hmem/index.ts";

export interface PriorKnowledge {
  flagged?: MemoryRecord;
  resolved?: MemoryRecord;
}

export class PharmacyMemory {
  readonly hmem: HMEM;

  constructor(persistDir: string, clock: () => number = Date.now) {
    this.hmem = new HMEM({ persistDir, clock, actor: "recallguard" });
  }

  private byTags(...tags: string[]): MemoryRecord[] {
    return this.hmem.store
      .all()
      .filter((m) => tags.every((t) => m.tags.includes(t)))
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  prior(sku: string, recallNumber: string): PriorKnowledge {
    const both = [`sku:${sku}`, `recall:${recallNumber}`];
    const resolved = this.byTags(...both, "resolved").find((m) => !m.supersededBy && m.confidence >= 0.35);
    const flagged = this.byTags(...both, "finding")[0];
    if (resolved) this.hmem.store.touch(resolved.id);
    if (flagged) this.hmem.store.touch(flagged.id);
    return { flagged, resolved };
  }

  rememberFinding(f: { sku: string; item_name: string; lot_number: string; recall_number: string; classification: string; action: string }, runId: string): MemoryRecord {
    const existing = this.byTags(`sku:${f.sku}`, `recall:${f.recall_number}`, "finding", `action:${f.action}`)[0];
    if (existing) {
      this.hmem.store.touch(existing.id);
      return existing;
    }
    return this.hmem.add({
      content: `Pharmacy stock ${f.sku} ${f.item_name} lot ${f.lot_number} is affected by FDA recall ${f.recall_number} (${f.classification}); recommended action ${f.action}`,
      type: "factual",
      layer: "working",
      tags: ["finding", `sku:${f.sku}`, `recall:${f.recall_number}`, `action:${f.action}`, "domain:pharmacy"],
      confidence: 0.9,
      source: `openfda:enforcement:${f.recall_number}`,
      provenance: { origin: "plan_completion", learnedAt: Date.now(), label: `RecallGuard run ${runId}`, refs: [f.recall_number] },
      missionId: "recall-monitoring",
      goalRunId: runId,
    });
  }

  rememberResolution(sku: string, recallNumber: string, note: string, pharmacist = "pharmacist"): MemoryRecord {
    const flagged = this.byTags(`sku:${sku}`, `recall:${recallNumber}`, "finding")[0];
    return this.hmem.add({
      content: `Resolved by ${pharmacist}: ${sku} for recall ${recallNumber}: ${note}`,
      type: "preference",
      layer: "long_term",
      tags: ["resolved", `sku:${sku}`, `recall:${recallNumber}`, "domain:pharmacy"],
      confidence: 0.95,
      source: `user_correction:${pharmacist}`,
      provenance: { origin: "user_correction", learnedAt: Date.now(), label: note, refs: [recallNumber] },
      missionId: "recall-monitoring",
      derivedFrom: flagged ? [flagged.id] : undefined,
    });
  }

  rememberCheck(runId: string, summary: string): MemoryRecord {
    return this.hmem.add({
      content: `Recall check ${runId} completed: ${summary}`,
      type: "general",
      layer: "working",
      tags: ["check", "domain:pharmacy"],
      confidence: 0.8,
      source: `recallguard:run:${runId}`,
      provenance: { origin: "plan_completion", learnedAt: Date.now(), label: "recall check summary" },
      missionId: "recall-monitoring",
      goalRunId: runId,
    });
  }

  lastCheck(): MemoryRecord | undefined {
    return this.byTags("check")[0];
  }

  context(query: string): QueryResult {
    return this.hmem.query(query, { topN: 8, threshold: 0.2 });
  }
}
