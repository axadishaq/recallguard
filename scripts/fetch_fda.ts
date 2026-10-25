// Builds the cached sample data in data/sample/ from the public openFDA API.
// No API key needed. Run: npm run fetch-data
//
// Default run refreshes the recall tables only. `--bootstrap` also rebuilds
// the NDC directory and a starter inventory (then curated by hand).
//
// Outputs (each as .json for SAMPLE_MODE and .csv for registering in Zetaris):
//   fda_recalls     one row per drug recall (enforcement report)
//   fda_recall_ndc  recall_number -> product_ndc (a recall can cover many NDCs)
//   fda_ndc         NDC directory rows for inventory products (package -> product NDC)
//   inventory       synthetic pharmacy shelf stock in 11-digit NDC format

import fs from "node:fs";
import path from "node:path";

const OUT = path.join(import.meta.dirname, "..", "data", "sample");
const API = "https://api.fda.gov/drug";

async function get(url: string): Promise<any> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (res.status === 404) return { results: [] };
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n") + "\n";
}

function save(name: string, rows: Record<string, unknown>[]): void {
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(rows, null, 1));
  fs.writeFileSync(path.join(OUT, `${name}.csv`), toCsv(rows));
  console.log(`  ${name}: ${rows.length} rows`);
}

// FDA package NDCs are 10 digits in 4-4-2, 5-3-2 or 5-4-1 form. Pharmacy and
// wholesaler systems store the 11-digit 5-4-2 form with no dashes.
export function toNdc11(packageNdc: string): string {
  const [a, b, c] = packageNdc.split("-");
  return a.padStart(5, "0") + b.padStart(4, "0") + c.padStart(2, "0");
}

const COMMON_GENERICS = [
  "atorvastatin", "metformin", "lisinopril", "amlodipine", "levothyroxine", "omeprazole",
  "losartan", "sertraline", "gabapentin", "simvastatin", "montelukast", "albuterol",
];

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  console.log("Fetching openFDA drug enforcement reports (2025-01-01 onward)...");

  const recalls: any[] = [];
  for (let skip = 0; skip < 3000; skip += 1000) {
    const data = await get(`${API}/enforcement.json?search=report_date:[20250101+TO+20261231]&limit=1000&skip=${skip}`);
    recalls.push(...(data.results ?? []));
    if ((data.results ?? []).length < 1000) break;
  }

  const recallRows = recalls.map((r) => ({
    recall_number: r.recall_number,
    report_date: r.report_date,
    recall_initiation_date: r.recall_initiation_date,
    status: r.status,
    classification: r.classification,
    recalling_firm: r.recalling_firm,
    product_description: (r.product_description ?? "").slice(0, 600),
    reason_for_recall: (r.reason_for_recall ?? "").slice(0, 600),
    code_info: (r.code_info ?? "").slice(0, 4000),
    brand_name: (r.openfda?.brand_name ?? []).join("; "),
    generic_name: (r.openfda?.generic_name ?? []).join("; "),
    source_url: `https://api.fda.gov/drug/enforcement.json?search=recall_number:"${r.recall_number}"`,
  }));
  const recallNdcRows = recalls.flatMap((r) =>
    (r.openfda?.product_ndc ?? []).map((ndc: string) => ({ recall_number: r.recall_number, product_ndc: ndc }))
  );

  save("fda_recalls", recallRows);
  save("fda_recall_ndc", recallNdcRows);
  fs.writeFileSync(
    path.join(OUT, "manifest.json"),
    JSON.stringify({ fetched_at: new Date().toISOString(), source: "https://open.fda.gov", recalls: recallRows.length }, null, 2)
  );
  // The inventory is the pharmacy's own (synthetic) data and is curated by hand
  // after bootstrapping, so it is only regenerated on request.
  if (!process.argv.includes("--bootstrap")) return;

  // Pick recalled products that have NDC metadata and a lot number in code_info,
  // so the demo inventory contains real, verifiable matches.
  const withNdc = recalls.filter((r) => (r.openfda?.product_ndc ?? []).length > 0 && /lot/i.test(r.code_info ?? ""));
  const classI = withNdc.filter((r) => r.classification === "Class I").slice(0, 2);
  const others = withNdc.filter((r) => r.classification !== "Class I").slice(0, 5);
  const recalledPicks = [...classI, ...others];

  console.log("Fetching NDC directory entries...");
  const ndcRows: Record<string, unknown>[] = [];
  const inventory: Record<string, unknown>[] = [];
  const notes: Record<string, unknown>[] = [];
  let sku = 1000;

  const addProduct = (p: any, lot: string, qty: number, note: string) => {
    const pkg = p.packaging?.[0];
    if (!pkg) return;
    ndcRows.push({
      package_ndc: pkg.package_ndc,
      product_ndc: p.product_ndc,
      brand_name: p.brand_name ?? "",
      generic_name: p.generic_name ?? "",
      labeler_name: p.labeler_name ?? "",
      package_description: (pkg.description ?? "").slice(0, 200),
    });
    inventory.push({
      sku: `SKU-${++sku}`,
      ndc11: toNdc11(pkg.package_ndc),
      item_name: `${p.generic_name ?? p.brand_name} ${p.active_ingredients?.[0]?.strength ?? ""}`.trim().toUpperCase(),
      supplier: p.labeler_name ?? "",
      lot_number: lot,
      qty_on_hand: qty,
      shelf_location: `A${(sku % 12) + 1}`,
    });
    notes.push({ sku: `SKU-${sku}`, note });
  };

  for (const [i, r] of recalledPicks.entries()) {
    const productNdc = r.openfda.product_ndc[0];
    const data = await get(`${API}/ndc.json?search=product_ndc:"${productNdc}"&limit=1`);
    const p = data.results?.[0];
    if (!p) continue;
    // Even picks hold a lot named in the recall (true positive); odd picks hold
    // a different lot (same product, unaffected lot -> needs verification).
    const lotMatch = (r.code_info as string).match(/lot[^A-Za-z0-9]*(?:#|no\.?|number|numbers)?[:\s]*([A-Z0-9-]{4,})/i);
    const recalledLot = lotMatch?.[1] ?? "UNKNOWN";
    const lot = i % 2 === 0 ? recalledLot : `X${240100 + i * 37}`;
    addProduct(p, lot, 5 + i * 3, i % 2 === 0 ? `recalled lot (${r.recall_number})` : `recalled product, other lot (${r.recall_number})`);
  }

  for (const g of COMMON_GENERICS) {
    const data = await get(`${API}/ndc.json?search=generic_name:"${g}"+AND+marketing_category:"ANDA"&limit=1`);
    const p = data.results?.[0];
    if (p) addProduct(p, `L${250300 + sku * 7}`, 20 + (sku * 13) % 80, "routine stock");
  }

  save("fda_ndc", ndcRows);
  save("inventory", inventory);
  fs.writeFileSync(path.join(OUT, "bootstrap_notes.json"), JSON.stringify(notes, null, 1));
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("fetch_fda.ts")) {
  main().catch((err) => {
    console.error("fetch failed:", err);
    process.exit(1);
  });
}
