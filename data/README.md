# Data

| File | Source | Licence | Rows | Notes |
|---|---|---|---|---|
| `sample/fda_recalls.*` | [openFDA drug enforcement](https://open.fda.gov/apis/drug/enforcement/), `report_date` 2025-01-01 onward | Public domain (CC0), [openFDA terms](https://open.fda.gov/terms/) | ~1,400 | Text fields truncated to 600 chars (`code_info` to 4,000) |
| `sample/fda_recall_ndc.*` | Same, `openfda.product_ndc` exploded | CC0 | ~2,400 | One row per recall × product NDC |
| `sample/fda_ndc.*` | [openFDA NDC directory](https://open.fda.gov/apis/drug/ndc/) | CC0 | 18 | Directory rows for inventory products. Bisoprolol 29300-187 was deliberately removed, because recalled products often drop out of the directory; this exercises the plan-revision path |
| `sample/inventory.*` | **Synthetic** pharmacy shelf export | n/a | 19 | 11-digit NDCs (5-4-2, no dashes), the format pharmacy and wholesaler systems use. Lots chosen so that real recalls apply |

Each table has a `.json` copy (for SAMPLE_MODE) and a `.csv` copy (for registering in Zetaris).

Refresh the recall tables: `npm run fetch-data`. Rebuild the starter inventory: `npm run fetch-data -- --bootstrap` (then curate it by hand).

Expected outcomes for the sample inventory (asserted in `tests/recallguard.test.ts`):

| SKU | Recall | Expected |
|---|---|---|
| SKU-1001 pegfilgrastim, lot 2199821 | D-0353-2026, Class I, specific serial numbers only | QUARANTINE + verify serials, urgent escalation |
| SKU-1002 homeopathic nasal spray | D-0289-2026, Class I, *all lots* | PULL NOW, urgent escalation |
| SKU-1003 bisoprolol/HCTZ, lot GBHL24005A | D-0301-2026, nitrosamine impurity | PULL NOW, found only after plan revision |
| SKU-1004 clevipidine, lot X240211 | D-0689-2026 lists other lots | cleared |
| SKU-1005 undecylenic acid, lot BL3468 | D-0697-2026 | PULL NOW |
| SKU-1006 cetirizine, lot X240285 | D-0348-2025 lists other lots | cleared |
| SKU-1007 chlorhexidine/IPA, lot 4080695 | D-0643-2026, sterility; 15 other recalls on the product don't list this lot | PULL NOW for D-0643 only |
| SKU-1008–1019 | none | no findings |
