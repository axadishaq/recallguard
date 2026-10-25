// Evaluator (critic): judges every candidate match on evidence strength and
// lot coverage, rejects weak matches, cross-checks ambiguous lot text with the
// model, and sends structured feedback to the Planner when evidence is missing.

import type { LlmClient } from "../llm/client.ts";
import type { Trace } from "../trace.ts";
import { analyseLot } from "./lots.ts";
import type { Action, Candidate, Feedback, Finding, InventoryItem } from "./types.ts";

const BASIS_CONFIDENCE = { package_ndc: 0.95, product_ndc_inferred: 0.8, name_and_firm: 0.6, name_only: 0.3 } as const;

export class Evaluator {
  constructor(private llm: LlmClient, private trace: Trace) {}

  gaps(items: InventoryItem[], doneSteps: Set<string>): Feedback[] {
    const unresolved = items.filter((i) => !i.product_ndc).map((i) => i.sku);
    if (unresolved.length && !doneSteps.has("infer_product_ndc")) {
      const fb: Feedback = { kind: "unresolved_ndc", detail: "Shelf NDC not found in FDA NDC directory; evidence incomplete", skus: unresolved };
      this.trace.log("evaluator", "feedback", `Missing evidence: ${unresolved.length} item(s) could not be resolved to an FDA product (${unresolved.join(", ")}). Requesting plan revision.`);
      return [fb];
    }
    return [];
  }

  async review(candidates: Candidate[]): Promise<Finding[]> {
    const findings: Finding[] = [];
    const seen = new Set<string>();
    for (const c of candidates) {
      const key = `${c.item.sku}|${c.recall.recall_number}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (c.basis === "name_only") {
        this.trace.log("evaluator", "decision", `Rejected ${c.item.sku} ↔ ${c.recall.recall_number}: name-only match, recalling firm "${c.recall.recalling_firm}" ≠ supplier "${c.item.supplier}"`);
        continue;
      }

      const lot = analyseLot(c.recall.code_info, c.item.lot_number);
      let verdict = lot.verdict;
      let modelCheck: string | undefined;

      // Ambiguous text, or high-stakes Class I: ask the model to read code_info.
      if (verdict === "unclear" || (c.recall.classification === "Class I" && verdict !== "all_lots")) {
        const res = await this.llm.json<{ affected: "yes" | "no" | "unclear"; quote: string }>("evaluator", [
          {
            role: "system",
            content:
              'You verify FDA recall scope. Given the recall code_info text and a lot number, answer JSON {"affected":"yes"|"no"|"unclear","quote":"<exact words from code_info>"}. Answer "yes" only if the lot is listed or all lots are recalled. Return only JSON.',
          },
          { role: "user", content: `Lot: ${c.item.lot_number}\ncode_info: ${String(c.recall.code_info).slice(0, 3000)}` },
        ], { fast: true });
        if (res) {
          modelCheck = `model says affected=${res.affected}: "${res.quote?.slice(0, 160)}"`;
          const modelSaysAffected = res.affected === "yes";
          const rulesSayAffected = verdict === "lot_listed" || verdict === "partial_serials";
          if (verdict === "unclear" && res.affected !== "unclear") verdict = modelSaysAffected ? "lot_listed" : "lot_not_listed";
          else if (verdict !== "unclear" && modelSaysAffected !== rulesSayAffected && res.affected !== "unclear") {
            this.trace.log("evaluator", "feedback", `Disagreement on ${c.item.sku}: rules=${verdict}, model=${res.affected}. Downgrading to manual lot verification.`);
            verdict = "unclear";
          }
        }
      }

      const action = this.decide(verdict, String(c.recall.status), String(c.recall.classification));
      const confidence = Number((BASIS_CONFIDENCE[c.basis] * (verdict === "unclear" ? 0.6 : 1)).toFixed(2));
      const f: Finding = {
        sku: c.item.sku,
        item_name: c.item.item_name,
        lot_number: c.item.lot_number,
        qty_on_hand: c.item.qty_on_hand,
        shelf_location: c.item.shelf_location,
        recall_number: c.recall.recall_number,
        classification: c.recall.classification,
        recall_status: c.recall.status,
        recalling_firm: c.recall.recalling_firm,
        report_date: c.recall.report_date,
        reason: String(c.recall.reason_for_recall).slice(0, 300),
        basis: c.basis,
        lot_verdict: verdict,
        lot_evidence: lot.evidence,
        action,
        rationale: this.explain(verdict, c, action),
        confidence,
        citation: c.recall.source_url,
        model_check: modelCheck,
      };
      this.trace.log("evaluator", "decision", `${f.sku} ${f.item_name.slice(0, 32)} × ${f.recall_number} (${f.classification}): ${verdict} → ${action} [conf ${confidence}]`, {
        data: { evidence: lot.evidence, basis: c.basis },
      });
      findings.push(f);
    }
    return findings;
  }

  private decide(verdict: string, status: string, classification: string): Action {
    if (verdict === "lot_not_listed") return "NO_ACTION";
    if (status === "Terminated" || status === "Completed") return verdict === "unclear" ? "NO_ACTION" : "MONITOR";
    if (verdict === "partial_serials") return "QUARANTINE_VERIFY_SERIALS";
    if (verdict === "unclear") return "VERIFY_LOT";
    return classification === "Class III" ? "MONITOR" : "PULL_NOW";
  }

  private explain(verdict: string, c: Candidate, action: Action): string {
    const how = {
      package_ndc: `NDC ${c.item.ndc11} resolves to FDA product ${c.item.product_ndc}, which recall ${c.recall.recall_number} covers`,
      product_ndc_inferred: `NDC ${c.item.ndc11} inferred as product ${c.recall.matched_product_ndc}, listed in recall ${c.recall.recall_number}`,
      name_and_firm: `name match corroborated by recalling firm ${c.recall.recalling_firm}`,
      name_only: "name only",
    }[c.basis];
    const lot = {
      lot_listed: `lot ${c.item.lot_number} is named in the recall`,
      partial_serials: `lot ${c.item.lot_number} is named but only specific serial numbers are recalled`,
      all_lots: "the recall covers all lots",
      lot_not_listed: `lot ${c.item.lot_number} is not among the recalled lots`,
      unclear: "the recall text does not clearly state lot coverage",
    }[verdict as "lot_listed"];
    const status = c.recall.status !== "Ongoing" ? ` Recall status: ${c.recall.status}.` : "";
    return `${how}; ${lot}.${status} → ${action.replace(/_/g, " ").toLowerCase()}.`;
  }
}
