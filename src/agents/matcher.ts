// Matcher (executor): queries the data layer to link shelf stock to recalls,
// from strongest evidence (exact package NDC) to weakest (name + firm).

import type { DataLayer, Row } from "../data/dataLayer.ts";
import { ndc11ToPackageCandidates, productOf, sqlList } from "../data/ndc.ts";
import type { Trace } from "../trace.ts";
import type { Candidate, InventoryItem, MatchBasis, Plan } from "./types.ts";

export class Matcher {
  constructor(private db: DataLayer, private trace: Trace) {}

  async loadInventory(plan: Plan): Promise<InventoryItem[]> {
    const where = plan.scope.itemFilter ? ` WHERE LOWER(item_name) LIKE '%${plan.scope.itemFilter.toLowerCase().replace(/'/g, "''")}%'` : "";
    const rows = await this.db.query(`SELECT * FROM ${this.db.table("inventory")}${where}`, "matcher", "Load shelf inventory");
    return rows.map((r) => ({ ...r, ndc11: String(r.ndc11).padStart(11, "0"), lot_number: String(r.lot_number), qty_on_hand: Number(r.qty_on_hand) }) as InventoryItem);
  }

  async resolveNdc(items: InventoryItem[]): Promise<InventoryItem[]> {
    for (const it of items) it.ndc_candidates = ndc11ToPackageCandidates(it.ndc11);
    const all = items.flatMap((i) => i.ndc_candidates ?? []);
    const rows = await this.db.query(
      `SELECT package_ndc, product_ndc FROM ${this.db.table("fda_ndc")} WHERE package_ndc IN (${sqlList(all)})`,
      "matcher",
      `Resolve ${items.length} 11-digit shelf NDCs against FDA NDC directory (${all.length} candidate formats)`
    );
    const byPkg = new Map(rows.map((r) => [r.package_ndc as string, r.product_ndc as string]));
    for (const it of items) {
      const hit = (it.ndc_candidates ?? []).find((c) => byPkg.has(c));
      if (hit) {
        it.package_ndc = hit;
        it.product_ndc = byPkg.get(hit);
      }
    }
    const unresolved = items.filter((i) => !i.product_ndc).map((i) => i.sku);
    this.trace.log("matcher", "decision", `${items.length - unresolved.length}/${items.length} NDCs resolved${unresolved.length ? `; unresolved: ${unresolved.join(", ")}` : ""}`);
    return items;
  }

  private async recallsForProducts(productNdcs: string[], purpose: string): Promise<Row[]> {
    if (productNdcs.length === 0) return [];
    return this.db.query(
      `SELECT rn.product_ndc AS matched_product_ndc, r.* FROM ${this.db.table("fda_recall_ndc")} rn
       JOIN ${this.db.table("fda_recalls")} r ON r.recall_number = rn.recall_number
       WHERE rn.product_ndc IN (${sqlList(productNdcs)})`,
      "matcher",
      purpose
    );
  }

  private toCandidates(items: InventoryItem[], rows: Row[], key: (i: InventoryItem) => string[], basis: MatchBasis): Candidate[] {
    const out: Candidate[] = [];
    for (const it of items) {
      const keys = new Set(key(it));
      for (const r of rows) if (keys.has(r.matched_product_ndc)) out.push({ item: it, recall: r, basis });
    }
    return out;
  }

  async matchByNdc(items: InventoryItem[]): Promise<Candidate[]> {
    const resolved = items.filter((i) => i.product_ndc);
    const rows = await this.recallsForProducts([...new Set(resolved.map((i) => i.product_ndc!))], "Join resolved product NDCs to FDA recall reports");
    return this.toCandidates(resolved, rows, (i) => [i.product_ndc!], "package_ndc");
  }

  // Revision step: item missing from the NDC directory; try the product code of
  // every candidate 10-digit format directly against the recall NDC list.
  async inferProductNdc(items: InventoryItem[]): Promise<Candidate[]> {
    const unresolved = items.filter((i) => !i.product_ndc);
    const keyOf = (i: InventoryItem) => (i.ndc_candidates ?? []).map(productOf);
    const rows = await this.recallsForProducts([...new Set(unresolved.flatMap(keyOf))], "Infer product codes for unresolved NDCs and match recalls");
    return this.toCandidates(unresolved, rows, keyOf, "product_ndc_inferred");
  }

  // Last resort: name match. Corroborated when the recalling firm matches the supplier.
  async matchByName(items: InventoryItem[], exclude: Set<string>): Promise<Candidate[]> {
    const out: Candidate[] = [];
    for (const it of items.filter((i) => !exclude.has(i.sku))) {
      const word = it.item_name.split(/[^A-Z]/i).find((w) => w.length >= 6)?.toLowerCase();
      if (!word) continue;
      const rows = await this.db.query(
        `SELECT * FROM ${this.db.table("fda_recalls")} WHERE LOWER(generic_name) LIKE '%${word}%' OR LOWER(product_description) LIKE '%${word}%'`,
        "matcher",
        `Name search "${word}" for ${it.sku}`
      );
      const firm = it.supplier.toLowerCase().split(/[^a-z]/).find((w) => w.length >= 4) ?? "";
      for (const r of rows.slice(0, 5)) {
        const corroborated = firm && String(r.recalling_firm).toLowerCase().includes(firm);
        out.push({ item: it, recall: r, basis: corroborated ? "name_and_firm" : "name_only" });
      }
    }
    return out;
  }
}
