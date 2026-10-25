// Planner: turns the pharmacist's request into a scoped plan, and revises the
// plan when the Evaluator reports gaps (unresolved NDCs, weak matches).

import type { LlmClient } from "../llm/client.ts";
import type { Trace } from "../trace.ts";
import type { Feedback, Plan, Step } from "./types.ts";

const BASE_STEPS: Step[] = ["resolve_ndc", "match_by_ndc", "verify_lots", "risk_review", "report"];

export class Planner {
  constructor(private llm: LlmClient, private trace: Trace) {}

  async plan(request: string, memoryContext: string): Promise<Plan> {
    const fromModel = await this.llm.json<{ itemFilter?: string | null; rationale?: string }>("planner", [
      {
        role: "system",
        content:
          "You plan FDA drug recall checks for a pharmacy. Read the request and return JSON " +
          '{"itemFilter": string|null, "rationale": string}. itemFilter is ONE drug name word to narrow the inventory ' +
          '(e.g. "bisoprolol") or null to check the whole shelf. Return only JSON.',
      },
      { role: "user", content: `Request: ${request}\n\nWhat memory says about earlier checks:\n${memoryContext || "(no earlier checks)"}` },
    ], { fast: true });

    const itemFilter = fromModel ? fromModel.itemFilter ?? undefined : this.keywordFilter(request);
    const plan: Plan = {
      request,
      scope: { itemFilter: itemFilter || undefined },
      steps: [...BASE_STEPS],
      rationale:
        fromModel?.rationale ??
        (itemFilter ? `Request names "${itemFilter}"; check only matching stock.` : "Full-shelf check against every recall in the data window."),
      revisions: [],
    };
    this.trace.log("planner", "plan", `Plan: ${plan.steps.join(" → ")}${plan.scope.itemFilter ? ` (scope: ${plan.scope.itemFilter})` : " (scope: full inventory)"}`, {
      data: { rationale: plan.rationale },
    });
    return plan;
  }

  private keywordFilter(request: string): string | undefined {
    const m = request.toLowerCase().match(/(?:check|is|are|about|for)\s+(?:the\s+|our\s+|my\s+)?([a-z]{5,})/);
    const stop = new Set(["recall", "recalls", "inventory", "shelf", "stock", "everything", "weekly", "daily", "today", "affected", "anything", "there", "which", "drugs", "products"]);
    return m && !stop.has(m[1]) ? m[1] : undefined;
  }

  // Feedback loop: the Evaluator's findings change what the Executor does next.
  revise(plan: Plan, feedback: Feedback[]): boolean {
    let changed = false;
    const insertBefore = (step: Step, before: Step, why: string) => {
      if (plan.steps.includes(step)) return;
      plan.steps.splice(plan.steps.indexOf(before), 0, step);
      plan.revisions.push(why);
      changed = true;
    };
    for (const f of feedback) {
      if (f.kind === "unresolved_ndc") {
        insertBefore("infer_product_ndc", "verify_lots", `Add product-code inference for ${f.skus.length} item(s) missing from the NDC directory`);
        insertBefore("match_by_name", "verify_lots", `Add name + firm search as last resort for ${f.skus.join(", ")}`);
      }
    }
    if (changed) this.trace.log("planner", "plan", `Plan revised: ${plan.steps.join(" → ")}`, { data: { revisions: plan.revisions } });
    return changed;
  }
}
