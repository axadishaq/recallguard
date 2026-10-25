// Risk agent: receives escalations for high-severity findings (Class I,
// sterility or contamination problems) and adds the safety steps a pharmacist
// must take beyond pulling stock. It never gives patient-level medical advice.

import type { LlmClient } from "../llm/client.ts";
import type { Trace } from "../trace.ts";
import type { Finding } from "./types.ts";

const SEVERE_REASON = /steril|microbial|contamin|bacteria|fung|mold|yeast|particulate|glass|nitros|carcino|temperature abuse|subpotent|superpotent|mislabel/i;

export class RiskAgent {
  constructor(private llm: LlmClient, private trace: Trace) {}

  needsEscalation(f: Finding): boolean {
    if (f.action === "NO_ACTION" || f.action === "MONITOR") return false;
    return f.classification === "Class I" || SEVERE_REASON.test(f.reason);
  }

  async review(findings: Finding[]): Promise<void> {
    for (const f of findings.filter((x) => this.needsEscalation(x))) {
      const urgent = f.classification === "Class I";
      this.trace.log("evaluator", "escalation", `Escalating ${f.sku} (${f.recall_number}, ${f.classification}) to Risk agent: ${f.reason.slice(0, 80)}`);
      const steps = [
        f.action === "QUARANTINE_VERIFY_SERIALS" ? `Quarantine all ${f.qty_on_hand} units of lot ${f.lot_number}; check each serial number against the recall list before releasing any` : `Remove all ${f.qty_on_hand} units of lot ${f.lot_number} from shelf ${f.shelf_location} and quarantine`,
        `Contact ${f.recalling_firm} / your wholesaler for return and credit referencing ${f.recall_number}`,
        urgent ? "Identify patients dispensed this lot (dispensing records) and follow the firm's patient-level notification instructions" : "Check whether any of this lot was dispensed; follow the firm's notice for patient-level instructions",
        "Document the action in the recall log; pharmacist sign-off required",
      ];
      const note = await this.llm.chat("risk", [
        {
          role: "system",
          content:
            "You are a pharmacy safety reviewer. In 2 short sentences, explain to a pharmacist why this recall is high risk and what to watch for. Do not give treatment advice; refer patient questions to their prescriber.",
        },
        { role: "user", content: `${f.item_name}, ${f.classification} recall ${f.recall_number}. Reason: ${f.reason}` },
      ], { fast: true });
      f.escalation = {
        level: urgent ? "urgent" : "standard",
        steps,
        note: note?.trim() || `${f.classification} recall: ${f.reason.slice(0, 160)}. Treat as ${urgent ? "urgent (same day)" : "priority"}; patient questions go to their prescriber.`,
      };
      this.trace.log("risk", "decision", `${f.sku}: ${f.escalation.level} escalation with ${steps.length} required steps`);
    }
  }
}
