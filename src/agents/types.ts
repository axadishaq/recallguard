import type { Row } from "../data/dataLayer.ts";
import type { LotVerdict } from "./lots.ts";

export type Step = "resolve_ndc" | "match_by_ndc" | "infer_product_ndc" | "match_by_name" | "verify_lots" | "risk_review" | "report";

export interface Plan {
  request: string;
  scope: { itemFilter?: string; skus?: string[] };
  steps: Step[];
  rationale: string;
  revisions: string[];
}

export type MatchBasis = "package_ndc" | "product_ndc_inferred" | "name_and_firm" | "name_only";

export interface InventoryItem {
  sku: string;
  ndc11: string;
  item_name: string;
  supplier: string;
  lot_number: string;
  qty_on_hand: number;
  shelf_location: string;
  package_ndc?: string;
  product_ndc?: string;
  ndc_candidates?: string[];
}

export interface Candidate {
  item: InventoryItem;
  recall: Row;
  basis: MatchBasis;
}

export type Action = "PULL_NOW" | "QUARANTINE_VERIFY_SERIALS" | "VERIFY_LOT" | "MONITOR" | "NO_ACTION";

export interface Finding {
  sku: string;
  item_name: string;
  lot_number: string;
  qty_on_hand: number;
  shelf_location: string;
  recall_number: string;
  classification: string;
  recall_status: string;
  recalling_firm: string;
  report_date: string;
  reason: string;
  basis: MatchBasis;
  lot_verdict: LotVerdict;
  lot_evidence: string;
  action: Action;
  rationale: string;
  confidence: number;
  citation: string;
  model_check?: string;
  escalation?: { level: "urgent" | "standard"; steps: string[]; note: string };
  memory_status?: "NEW" | "PREVIOUSLY_FLAGGED" | "ALREADY_RESOLVED";
  memory_note?: string;
}

export type FeedbackKind = "unresolved_ndc" | "weak_match" | "lot_unclear" | "model_disagrees";

export interface Feedback {
  kind: FeedbackKind;
  detail: string;
  skus: string[];
}

export interface RunState {
  plan: Plan;
  items: InventoryItem[];
  candidates: Candidate[];
  findings: Finding[];
  done: Set<Step>;
  iteration: number;
}
