// Reporter: produces the pharmacist's action list. Findings are annotated with
// H-MEM memory (new / previously flagged / already resolved) and the summary
// prompt receives H-MEM's reinjection context.

import type { LlmClient } from "../llm/client.ts";
import type { PharmacyMemory } from "../engines/pharmacyMemory.ts";
import type { Trace } from "../trace.ts";
import type { Action, Finding, Plan } from "./types.ts";

const ORDER: Action[] = ["PULL_NOW", "QUARANTINE_VERIFY_SERIALS", "VERIFY_LOT", "MONITOR", "NO_ACTION"];

export interface Report {
  runId: string;
  generatedAt: string;
  request: string;
  dataSource: string;
  summary: string;
  counts: Record<Action, number> & { new: number; resolved: number };
  findings: Finding[];
  planRevisions: string[];
  memory: { lastCheck?: string; reinjected: string[] };
  disclaimer: string;
}

export class Reporter {
  constructor(private llm: LlmClient, private memory: PharmacyMemory, private trace: Trace) {}

  annotateWithMemory(findings: Finding[]): void {
    for (const f of findings) {
      if (f.action === "NO_ACTION") continue;
      const prior = this.memory.prior(f.sku, f.recall_number);
      if (prior.resolved) {
        f.memory_status = "ALREADY_RESOLVED";
        f.memory_note = prior.resolved.provenance.label;
        this.trace.log("reporter", "memory", `H-MEM: ${f.sku} × ${f.recall_number} already resolved ("${prior.resolved.provenance.label}"), suppressing alert`, {
          data: { memoryId: prior.resolved.id },
        });
      } else if (prior.flagged) {
        f.memory_status = "PREVIOUSLY_FLAGGED";
        f.memory_note = `first flagged ${new Date(prior.flagged.timestamp).toISOString().slice(0, 10)}, still unresolved`;
        this.trace.log("reporter", "memory", `H-MEM: ${f.sku} × ${f.recall_number} was flagged before and is still open`, { data: { memoryId: prior.flagged.id } });
      } else {
        f.memory_status = "NEW";
      }
    }
  }

  async report(runId: string, plan: Plan, findings: Finding[], dataSource: string): Promise<Report> {
    const actionable = findings.filter((f) => f.action !== "NO_ACTION");
    const resolvedRank = (f: Finding) => (f.memory_status === "ALREADY_RESOLVED" ? 1 : 0);
    actionable.sort((a, b) => resolvedRank(a) - resolvedRank(b) || ORDER.indexOf(a.action) - ORDER.indexOf(b.action));
    const cleared = findings.filter((f) => f.action === "NO_ACTION");
    const ordered = [...actionable, ...cleared];

    const counts = Object.fromEntries(ORDER.map((a) => [a, findings.filter((f) => f.action === a && f.memory_status !== "ALREADY_RESOLVED").length])) as Report["counts"];
    counts.new = findings.filter((f) => f.memory_status === "NEW" && f.action !== "NO_ACTION").length;
    counts.resolved = findings.filter((f) => f.memory_status === "ALREADY_RESOLVED").length;

    const ctx = this.memory.context(`recall check pharmacy ${actionable.map((f) => `${f.sku} ${f.recall_number}`).join(" ")}`);
    const last = this.memory.lastCheck();
    if (ctx.memories.length) this.trace.log("reporter", "memory", `H-MEM reinjected ${ctx.memories.length} memories (${ctx.trace.strategy})`, { data: ctx.trace.scores });

    const fallback = this.templateSummary(counts, actionable, last?.content);
    const brief = actionable
      .filter((f) => f.memory_status !== "ALREADY_RESOLVED")
      .map((f) => `${f.action}: ${f.item_name} lot ${f.lot_number} (${f.recall_number}, ${f.classification}, ${f.memory_status}) — ${f.rationale}`)
      .join("\n");
    const summary =
      (await this.llm.chat("reporter", [
        {
          role: "system",
          content:
            "Write a 3-4 sentence briefing for a community pharmacist about today's FDA recall check. Lead with what must be pulled now. Mention items that are new since the last check. Cite recall numbers. No medical advice. Plain text.",
        },
        { role: "user", content: `Findings:\n${brief || "(no affected stock)"}\n\n${ctx.context}\nLast check: ${last?.content ?? "none"}` },
      ]))?.trim() || fallback;

    return {
      runId,
      generatedAt: new Date().toISOString(),
      request: plan.request,
      dataSource,
      summary,
      counts,
      findings: ordered,
      planRevisions: plan.revisions,
      memory: { lastCheck: last?.content, reinjected: ctx.memories.map((m) => m.memory.content) },
      disclaimer: "Decision support only. Verify every recall against the FDA notice and the firm's letter before acting. Not medical advice.",
    };
  }

  private templateSummary(counts: Report["counts"], actionable: Finding[], last?: string): string {
    const pull = actionable.filter((f) => f.action === "PULL_NOW" && f.memory_status !== "ALREADY_RESOLVED");
    const parts = [
      pull.length ? `Pull now: ${pull.map((f) => `${f.item_name} lot ${f.lot_number} (${f.recall_number}, ${f.classification})`).join("; ")}.` : "No stock needs to be pulled immediately.",
      counts.QUARANTINE_VERIFY_SERIALS ? `${counts.QUARANTINE_VERIFY_SERIALS} item(s) need serial-number verification before release.` : "",
      counts.VERIFY_LOT ? `${counts.VERIFY_LOT} item(s) need manual lot verification.` : "",
      `${counts.new} finding(s) are new since the last check${counts.resolved ? `; ${counts.resolved} already resolved by staff were suppressed` : ""}.`,
      last ? `Previous check: ${last.replace(/^Recall check \S+ completed: /, "")}` : "",
    ];
    return parts.filter(Boolean).join(" ");
  }
}

export function reportToMarkdown(r: Report): string {
  const lines = [
    `# RecallGuard report: ${r.generatedAt.slice(0, 16).replace("T", " ")} UTC`,
    "",
    `**Request:** ${r.request}  `,
    `**Data source:** ${r.dataSource}`,
    "",
    `> ${r.summary}`,
    "",
    "| Action | Item | Lot | Recall | Class | Memory | Why |",
    "|---|---|---|---|---|---|---|",
    ...r.findings.filter((f) => f.action !== "NO_ACTION").map(
      (f) =>
        `| **${f.memory_status === "ALREADY_RESOLVED" ? "✓ RESOLVED" : f.action.replace(/_/g, " ")}** | ${f.sku} ${f.item_name} | ${f.lot_number} | [${f.recall_number}](${f.citation}) | ${f.classification} | ${f.memory_status ?? ""}${f.memory_note ? ` (${f.memory_note})` : ""} | ${f.rationale} |`
    ),
  ];
  const cleared = r.findings.filter((f) => f.action === "NO_ACTION");
  if (cleared.length) {
    const skus = [...new Set(cleared.map((f) => `${f.sku} ${f.item_name} (lot ${f.lot_number})`))];
    lines.push("", `**Cleared:** ${cleared.length} recall match(es) checked where the shelf lot is not recalled: ${skus.join("; ")}.`);
  }
  const esc = r.findings.filter((f) => f.escalation && f.memory_status !== "ALREADY_RESOLVED");
  if (esc.length) {
    lines.push("", "## Escalations");
    for (const f of esc) {
      lines.push("", `### ${f.escalation!.level.toUpperCase()}: ${f.item_name} (${f.recall_number})`, "", f.escalation!.note, "", ...f.escalation!.steps.map((s) => `- [ ] ${s}`));
    }
  }
  if (r.planRevisions.length) lines.push("", "## How the agents adapted", "", ...r.planRevisions.map((p) => `- ${p}`));
  lines.push("", `_${r.disclaimer}_`, "");
  return lines.join("\n");
}
