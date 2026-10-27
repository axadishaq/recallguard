# HackOS submission: copy and paste

**Project name:** RecallGuard
**Track:** 2: The Agent That Can Explain Why
**GitHub:** https://github.com/axadishaq/recallguard
**Slide deck:** upload `docs/RecallGuard-deck.pdf` (the same deck as `docs/deck.html`)
**Demo video:** [YouTube or Drive link, 1–4 min]

## Short description

RecallGuard is a multi-agent FDA drug-recall checker for independent pharmacies. A Planner, Matcher, Evaluator, Risk agent and Reporter cross-check every item on the shelf against real openFDA recall reports. They reconcile the pharmacy's 11-digit NDCs with the FDA's three 10-digit formats, read the free-text lot lists to decide whether *our* lot is affected, escalate Class I and sterility recalls, and produce a cited action list (pull now / quarantine and verify serials / cleared). Meterless H-MEM remembers past findings and the pharmacist's own resolutions, so each weekly check raises only what is new or still open.

## Problem and target users

Independent community pharmacists have no recall team. FDA recalls list NDCs and lots in free text ("all lots within expiry", "subset of lot 2199821, specific serial numbers"), the NDC formats don't match pharmacy systems, and nothing records which recalls were already handled. Missing a lot puts patients at risk; pulling on a name match wastes stock.

## Sponsor technology explanation

**Zetaris (data layer).** All agent data access is SQL through the Zetaris REST query API (`POST /api/v1.0/query/sql/start`, then `GET /query/sql/page`, then `DELETE /query/sql/close`), implemented in `src/data/dataLayer.ts` (`ZetarisLayer`). Zetaris federates four sources: the pharmacy inventory export, the openFDA NDC directory, recall reports, and recall↔NDC links. The Matcher's main query joins all four. On startup, RecallGuard runs a health-check query; if Zetaris is unavailable, the same SQL runs on a cached sample, and the trace and UI say so. Setup: `docs/ZETARIS_SETUP.md`.
[STATUS, edit before submitting: either "Verified live against Zetaris Freemium on <date>", or "Zetaris Docker image access was requested on 25 Oct and had not been granted by the deadline; the integration is written against Zetaris's published OpenAPI spec, and the demo runs on the cached sample with the identical SQL."]

**Meterless Engine: H-MEM.** `src/engines/pharmacyMemory.ts` builds on the H-MEM engine (`src/engines/hmem`, the Meterless reference implementation, declared below). Each finding is mined into the working layer with the FDA recall as its mandatory `source`. A pharmacist's resolution is stored as a `user_correction` in the long-term layer, with `derivedFrom` lineage to the finding. Later sessions mark findings NEW / PREVIOUSLY_FLAGGED / ALREADY_RESOLVED and suppress resolved alerts. The Reporter's prompt gets H-MEM's hybrid-ranked reinjection context, and every write goes to the H-MEM trust ledger.
*Tests:* `npm run test:hmem` runs Meterless's official H-MEM conformance suite against our module (13/13 pass). `npm test` includes "H-MEM: a pharmacist's resolution suppresses the alert in the next session".

**Meterless Nightshift (AI provider).** `src/llm/client.ts` follows the Meterless Runtime 0.90.0 provider contract: OpenAI-compatible `/v1/chat/completions`, URL normalisation, Bearer proxy-token, `meterless-app: recallguard` and `meterless-scope: user` headers, `meterless/*` routing modes, and a 180 s timeout. The model that served each call is written to the trace. If no model is reachable, the agents fall back to deterministic logic and the trace records it.

**NVIDIA.** Nemotron models are routed through Nightshift (`LLM_MODEL` / `LLM_MODEL_FAST`). They handle the Evaluator's second reading of Class I and ambiguous lot text, the Planner's request scoping, the Risk agent's safety note, and the pharmacist briefing.
[Edit before submitting: the exact Nemotron model id shown in the trace, or remove this paragraph if Nightshift wasn't connected.]

**What's unique.** The agents refuse to guess. Evidence is ranked (exact package NDC → inferred product code → name + firm; name-only matches are rejected). Missing evidence triggers a plan revision instead of an answer. Rules and the model each read the lot text, and when they disagree the item goes to a human. And the pharmacist's corrections in H-MEM change what future runs report.

## Pre-existing components (declare in the form)

- `src/engines/hmem/`: Meterless H-MEM reference implementation (Apache-2.0, © Meterless), used as the engine core.
- `tests/hmem-conformance/`: Meterless H-MEM conformance suite, unmodified.
- Public data from openFDA (CC0).

Everything else was written during the build window, from 25 Oct 2026.

## Final checklist

- [ ] Team of one created on HackOS (Team Finder)
- [ ] Demo video uploaded (1–4 min) and link pasted
- [ ] `docs/RecallGuard-deck.pdf` uploaded
- [ ] Both `[STATUS]` / `[Edit]` placeholders above resolved
- [ ] Repo is public (yes) with no secrets (checked)
- [ ] Submitted before **27 Oct 23:45 UTC**
