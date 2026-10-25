// Deterministic reading of the free-text FDA `code_info` field, which is where
// recalls list affected lots. The Evaluator uses this first and asks the
// model only when the text is ambiguous or to cross-check.

export type LotVerdict = "lot_listed" | "partial_serials" | "all_lots" | "lot_not_listed" | "unclear";

export interface LotAnalysis {
  verdict: LotVerdict;
  evidence: string;
}

function snippetAround(text: string, idx: number, len: number): string {
  const s = Math.max(0, idx - 60);
  const e = Math.min(text.length, idx + len + 60);
  return `${s > 0 ? "…" : ""}${text.slice(s, e).trim()}${e < text.length ? "…" : ""}`;
}

export function analyseLot(codeInfo: string, lot: string): LotAnalysis {
  const text = codeInfo ?? "";
  const upper = text.toUpperCase();
  const lotU = (lot ?? "").toUpperCase().trim();

  const allLots = upper.match(/ALL LOTS|ALL LOT NUMBERS|ALL PRODUCT WITHIN EXPIRY|ALL UNEXPIRED/);
  if (allLots) return { verdict: "all_lots", evidence: snippetAround(text, allLots.index!, allLots[0].length) };

  if (lotU) {
    const esc = lotU.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = new RegExp(`(^|[^A-Z0-9])${esc}([^A-Z0-9]|$)`).exec(upper);
    if (m) {
      const at = m.index + m[1].length;
      const partial = /SERIAL|SUBSET|SPECIFIC (UNITS|CARTONS)/.test(upper);
      return { verdict: partial ? "partial_serials" : "lot_listed", evidence: snippetAround(text, at, lotU.length) };
    }
  }

  // A lot list is present but ours is not in it.
  if (/\bLOTS?\b|LOT\s*#|BATCH/.test(upper) && /\d{4,}/.test(upper)) {
    return { verdict: "lot_not_listed", evidence: text.slice(0, 160) + (text.length > 160 ? "…" : "") };
  }
  return { verdict: "unclear", evidence: text.slice(0, 160) || "(no code_info in recall)" };
}
