# RecallGuard report: 2026-10-25 09:06 UTC

**Request:** Weekly recall check of all shelf stock  
**Data source:** local-sample

> Pull now: HOMEOPATHIC ALLERGY NASAL SPRAY 20ML lot X240137 (D-0289-2026, Class I); UNDECYLENIC ACID 25 G/100ML lot BL3468 (D-0697-2026, Class II); CHLORHEXIDINE GLUCONATE AND ISOPROPYL ALCOHOL 20 MG/ML lot 4080695 (D-0643-2026, Class II). 1 item(s) need serial-number verification before release. 0 finding(s) are new since the last check; 1 already resolved by staff were suppressed. Previous check: 4 pull-now, 1 quarantine, 0 verify, 5 new, 19 items checked

| Action | Item | Lot | Recall | Class | Memory | Why |
|---|---|---|---|---|---|---|
| **PULL NOW** | SKU-1002 HOMEOPATHIC ALLERGY NASAL SPRAY 20ML | X240137 | [D-0289-2026](https://api.fda.gov/drug/enforcement.json?search=recall_number:"D-0289-2026") | Class I | PREVIOUSLY_FLAGGED (first flagged 2026-10-25, still unresolved) | NDC 62795400609 resolves to FDA product 62795-4006, which recall D-0289-2026 covers; the recall covers all lots. → pull now. |
| **PULL NOW** | SKU-1005 UNDECYLENIC ACID 25 G/100ML | BL3468 | [D-0697-2026](https://api.fda.gov/drug/enforcement.json?search=recall_number:"D-0697-2026") | Class II | PREVIOUSLY_FLAGGED (first flagged 2026-10-25, still unresolved) | NDC 63347060001 resolves to FDA product 63347-600, which recall D-0697-2026 covers; lot BL3468 is named in the recall. → pull now. |
| **PULL NOW** | SKU-1007 CHLORHEXIDINE GLUCONATE AND ISOPROPYL ALCOHOL 20 MG/ML | 4080695 | [D-0643-2026](https://api.fda.gov/drug/enforcement.json?search=recall_number:"D-0643-2026") | Class II | PREVIOUSLY_FLAGGED (first flagged 2026-10-25, still unresolved) | NDC 54365040039 resolves to FDA product 54365-400, which recall D-0643-2026 covers; lot 4080695 is named in the recall. → pull now. |
| **QUARANTINE VERIFY SERIALS** | SKU-1001 PEGFILGRASTIM-CBQV 6 MG/.6ML | 2199821 | [D-0353-2026](https://api.fda.gov/drug/enforcement.json?search=recall_number:"D-0353-2026") | Class I | PREVIOUSLY_FLAGGED (first flagged 2026-10-25, still unresolved) | NDC 69448002563 resolves to FDA product 69448-025, which recall D-0353-2026 covers; lot 2199821 is named but only specific serial numbers are recalled. → quarantine verify serials. |
| **✓ RESOLVED** | SKU-1003 BISOPROLOL FUMARATE AND HYDROCHLOROTHIAZIDE 6.25 MG/1 | GBHL24005A | [D-0301-2026](https://api.fda.gov/drug/enforcement.json?search=recall_number:"D-0301-2026") | Class II | ALREADY_RESOLVED (All 11 units returned to Unichem via wholesaler, credit memo CM-4471) | NDC 29300018701 inferred as product 29300-187, listed in recall D-0301-2026; lot GBHL24005A is named in the recall. → pull now. |

**Cleared:** 17 recall match(es) checked where the shelf lot is not recalled: SKU-1004 CLEVIPIDINE .5 MG/ML (lot X240211); SKU-1006 CETIRIZINE 5 MG/1 (lot X240285); SKU-1007 CHLORHEXIDINE GLUCONATE AND ISOPROPYL ALCOHOL 20 MG/ML (lot 4080695).

## Escalations

### URGENT: HOMEOPATHIC ALLERGY NASAL SPRAY 20ML (D-0289-2026)

Class I recall: Microbial Contamination of Non-Sterile Products: The products have been found to contain yeast/mold and microbial contamination identified as Achromobacter.. Treat as urgent (same day); patient questions go to their prescriber.

- [ ] Remove all 8 units of lot X240137 from shelf A7 and quarantine
- [ ] Contact Medinatura New Mexico, inc. / your wholesaler for return and credit referencing D-0289-2026
- [ ] Identify patients dispensed this lot (dispensing records) and follow the firm's patient-level notification instructions
- [ ] Document the action in the recall log; pharmacist sign-off required

### STANDARD: CHLORHEXIDINE GLUCONATE AND ISOPROPYL ALCOHOL 20 MG/ML (D-0643-2026)

Class II recall: Lack of assurance of sterility: Unsterilized ChloraPrep & PurPrep Applicators, intended for further processing and sterilization were instead distributed to cus. Treat as priority; patient questions go to their prescriber.

- [ ] Remove all 23 units of lot 4080695 from shelf A12 and quarantine
- [ ] Contact CareFusion 213, LLC / your wholesaler for return and credit referencing D-0643-2026
- [ ] Check whether any of this lot was dispensed; follow the firm's notice for patient-level instructions
- [ ] Document the action in the recall log; pharmacist sign-off required

### URGENT: PEGFILGRASTIM-CBQV 6 MG/.6ML (D-0353-2026)

Class I recall: Temperature Abuse. 116 cartons with specific serial numbers of Lot 2199821, were stored incorrectly in a controlled room temperature environment instead of the . Treat as urgent (same day); patient questions go to their prescriber.

- [ ] Quarantine all 5 units of lot 2199821; check each serial number against the recall list before releasing any
- [ ] Contact McKesson / your wholesaler for return and credit referencing D-0353-2026
- [ ] Identify patients dispensed this lot (dispensing records) and follow the firm's patient-level notification instructions
- [ ] Document the action in the recall log; pharmacist sign-off required

## How the agents adapted

- Add product-code inference for 1 item(s) missing from the NDC directory
- Add name + firm search as last resort for SKU-1003

_Decision support only. Verify every recall against the FDA notice and the firm's letter before acting. Not medical advice._
