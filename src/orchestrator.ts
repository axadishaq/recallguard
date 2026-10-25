// Orchestrator: Planner ↔ Matcher ↔ Evaluator loop with plan revision,
// escalation to the Risk agent, H-MEM memory, and a bounded iteration count.

import fs from "node:fs";
import path from "node:path";
import { config } from "./config.ts";
import { createDataLayer } from "./data/dataLayer.ts";
import { PharmacyMemory } from "./engines/pharmacyMemory.ts";
import { LlmClient } from "./llm/client.ts";
import { Trace } from "./trace.ts";
import { Planner } from "./agents/planner.ts";
import { Matcher } from "./agents/matcher.ts";
import { Evaluator } from "./agents/evaluator.ts";
import { RiskAgent } from "./agents/risk.ts";
import { Reporter, reportToMarkdown } from "./agents/reporter.ts";
import type { Report } from "./agents/reporter.ts";
import type { Candidate, RunState, Step } from "./agents/types.ts";

export interface RunResult {
  report: Report;
  markdown: string;
  trace: Trace;
  traceFile: string;
}

export function openMemory(): PharmacyMemory {
  return new PharmacyMemory(path.join(config.stateDir, "hmem"));
}

export async function runCheck(request: string, opts: { trace?: Trace } = {}): Promise<RunResult> {
  const trace = opts.trace ?? new Trace();
  const db = await createDataLayer(trace);
  const llm = new LlmClient(trace);
  if (!llm.available) trace.log("llm", "fallback", "No Nightshift token configured: agents use deterministic reasoning (sample mode)");
  const memory = openMemory();

  const planner = new Planner(llm, trace);
  const matcher = new Matcher(db, trace);
  const evaluator = new Evaluator(llm, trace);
  const risk = new RiskAgent(llm, trace);
  const reporter = new Reporter(llm, memory, trace);

  const last = memory.lastCheck();
  if (last) trace.log("planner", "memory", `H-MEM: last check found: "${last.content.slice(0, 120)}"`);
  const plan = await planner.plan(request, last?.content ?? "");
  const state: RunState = { plan, items: [], candidates: [], findings: [], done: new Set(), iteration: 0 };

  state.items = await matcher.loadInventory(plan);
  if (state.items.length === 0) trace.log("matcher", "decision", "No inventory matches the requested scope");

  const runStep = async (step: Step): Promise<Candidate[]> => {
    switch (step) {
      case "resolve_ndc":
        await matcher.resolveNdc(state.items);
        return [];
      case "match_by_ndc":
        return matcher.matchByNdc(state.items);
      case "infer_product_ndc":
        return matcher.inferProductNdc(state.items);
      case "match_by_name": {
        const covered = new Set(state.candidates.map((c) => c.item.sku));
        const resolved = new Set(state.items.filter((i) => i.product_ndc).map((i) => i.sku));
        return matcher.matchByName(state.items, new Set([...covered, ...resolved]));
      }
      default:
        return [];
    }
  };

  // Execute → evaluate → revise, until the Evaluator has no open gaps.
  while (state.iteration < config.maxIterations) {
    state.iteration++;
    trace.log("orchestrator", "plan", `Iteration ${state.iteration}`);
    for (const step of plan.steps) {
      if (state.done.has(step) || step === "verify_lots" || step === "risk_review" || step === "report") continue;
      state.candidates.push(...(await runStep(step)));
      state.done.add(step);
    }
    const gaps = evaluator.gaps(state.items, state.done);
    if (gaps.length === 0 || !planner.revise(plan, gaps)) break;
  }

  trace.log("matcher", "decision", `${state.candidates.length} candidate recall matches to verify`);
  state.findings = await evaluator.review(state.candidates);
  await risk.review(state.findings);
  reporter.annotateWithMemory(state.findings);
  const report = await reporter.report(trace.runId, plan, state.findings, db.name);

  for (const f of state.findings) if (f.action !== "NO_ACTION") memory.rememberFinding(f, trace.runId);
  memory.rememberCheck(trace.runId, `${report.counts.PULL_NOW} pull-now, ${report.counts.QUARANTINE_VERIFY_SERIALS} quarantine, ${report.counts.VERIFY_LOT} verify, ${report.counts.new} new, ${state.items.length} items checked`);
  trace.log("reporter", "output", `Report ready: ${report.findings.length} findings, ${report.counts.new} new`);

  const markdown = reportToMarkdown(report);
  const traceFile = trace.save(config.runsDir);
  fs.writeFileSync(path.join(config.runsDir, `${trace.runId}.report.json`), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(config.runsDir, `${trace.runId}.report.md`), markdown);
  return { report, markdown, trace, traceFile };
}
