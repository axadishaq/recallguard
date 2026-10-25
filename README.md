# RecallGuard

**A multi-agent FDA drug-recall checker for independent pharmacies.** RecallGuard cross-checks every item on the shelf against FDA recall reports. It reconciles mismatched NDC formats, reads the free-text lot lists in each recall, and gives the pharmacist a cited action list: *pull now*, *quarantine and verify serials*, or *cleared*. It also remembers what staff have already handled, so the next check only raises new problems.

> Open Agent Hackathon 2026 · Track 2: **The Agent That Can Explain Why**

## The problem

The FDA publishes a few hundred drug recalls a year. Each recall covers specific NDCs and specific lots, and the lots are listed in free text like *"Subset of Lot 2199821, specific serial numbers…"* or *"All lots within expiry"*. A small pharmacy has to match those notices to its own stock by hand. The stock system records 11-digit NDCs with no dashes, while the FDA uses 10-digit codes in three different formats. Matching by name alone flags false positives, missed lots put patients at risk, and nobody remembers which recalls were already dealt with.

## What it does

```
             ┌──────────── H-MEM (Meterless) ─────────────┐
             │ past checks · open findings · staff fixes  │
             └──────▲──────────────────────────▲──────────┘
request ─► Planner ─┴─► Matcher ──SQL──► Zetaris (inventory ⨝ NDC directory ⨝ recalls)
              ▲            │
              │ revise     ▼
              └──────── Evaluator ──escalate──► Risk agent
                           │  (Class I, sterility, contamination)
                           ▼
                        Reporter ─► cited action list + live trace (model per step)
```

| Agent | Role | Real decisions |
|---|---|---|
| **Planner** | Turns the request into a scoped plan ("is our bisoprolol affected?" checks only the bisoprolol) | Revises the plan when the Evaluator reports missing evidence |
| **Matcher** (executor) | Runs SQL through Zetaris: resolve shelf NDC → FDA product → recalls | Moves from strongest evidence (exact package NDC) to inferred product code to name + firm |
| **Evaluator** (critic) | Reads `code_info` to decide whether *our lot* is affected | Rejects name-only matches; asks the model to cross-check Class I or ambiguous lot text; downgrades to manual verification when rules and model disagree; sends gaps back to the Planner |
| **Risk agent** | Takes escalations for Class I and sterility or contamination recalls | Adds quarantine, supplier, patient-notification and sign-off steps |
| **Reporter** | Writes the action list and briefing | Uses H-MEM to mark each finding NEW, PREVIOUSLY_FLAGGED or ALREADY_RESOLVED; receives H-MEM reinjection context |

**The feedback loop in the demo data:** bisoprolol/HCTZ (lot GBHL24005A) is missing from the FDA NDC directory, because recalled products often drop out of it. On the first pass the Evaluator reports the gap. The Planner then adds `infer_product_ndc` and `match_by_name` steps, and the next iteration finds the nitrosamine recall D-0301-2026. You can see every step in the trace.

## Sponsor technology

| Sponsor | How RecallGuard uses it |
|---|---|
| **Zetaris** (data layer) | All agent data access is SQL through the Zetaris REST API (`src/data/dataLayer.ts`, `ZetarisLayer`). Zetaris federates four sources: the pharmacy inventory export, the openFDA NDC directory, recall reports, and recall-NDC links. The Matcher's main query joins all of them. Setup: [docs/ZETARIS_SETUP.md](docs/ZETARIS_SETUP.md) |
| **Meterless H-MEM** (engine) | `src/engines/pharmacyMemory.ts` over the H-MEM engine (`src/engines/hmem`). Findings are mined into the working layer with the FDA recall as `source`; a pharmacist's resolution is stored as a `user_correction` in the long-term layer with `derivedFrom` lineage, and suppresses repeat alerts in later sessions. The Reporter gets hybrid-ranked reinjection context, and every write is in the H-MEM trust ledger. **Test:** `npm run test:hmem` runs Meterless's official conformance suite (13/13), and `npm test` covers the cross-session behavior |
| **Meterless Nightshift** (AI provider) | `src/llm/client.ts` follows the Meterless Runtime 0.90.0 provider contract: OpenAI-compatible `/v1/chat/completions`, Bearer proxy-token, `meterless-app` and `meterless-scope` headers, `meterless/*` routing modes, and a 180 s timeout. The model that served each call is recorded in the trace |
| **NVIDIA** | Nemotron models connected in Nightshift's Providers tab and selected through `LLM_MODEL` / `LLM_MODEL_FAST`. They handle the Evaluator's lot-scope cross-check, the Planner's request scoping, the Risk note and the briefing |

## Quick start (offline sample mode: no Zetaris, no API keys)

```bash
npm install
npm test                 # 6 app tests (end-to-end, memory, NDC, lot parsing)
npm run test:hmem        # Meterless H-MEM conformance suite
npm run check            # full-shelf check in the terminal, with a colored agent trace
npm run ui               # http://localhost:3030: run checks, watch agents, mark items resolved
```

To try memory from the CLI:

```bash
npm run check                                                   # 5 NEW findings
npm run check -- --resolve SKU-1003 D-0301-2026 "returned to supplier, credit memo CM-4471"
npm run check                                                   # bisoprolol now ALREADY_RESOLVED, others PREVIOUSLY_FLAGGED
npm run check -- "Is our bisoprolol affected?"                  # scoped plan
npm run check -- --reset-memory
```

## Live mode

1. Copy `.env.example` to `.env`.
2. **Zetaris:** follow [docs/ZETARIS_SETUP.md](docs/ZETARIS_SETUP.md), then set `SAMPLE_MODE=false` and the `ZETARIS_*` values.
3. **Nightshift:** start the runtime, connect NVIDIA in its Providers tab, and copy the token from `<stateDir>/proxy-token` into `LLM_API_KEY`. Set `LLM_MODEL` to a routing mode listed by `GET /v1/models`.
4. `npm run fetch-data` refreshes the openFDA recall tables (public API, no key needed).

Each layer degrades on its own. If Zetaris is down, RecallGuard uses the cached sample. If Nightshift is unavailable, the agents use deterministic logic. The trace always says which path ran.

## Outputs

Each run writes three files to `runs/`:

- `<runId>.jsonl`: the full trace (agent, kind, message, SQL, and the model that served each call)
- `<runId>.report.json`: structured findings
- `<runId>.report.md`: the pharmacist's action list

Examples are in `output_examples/`.

## Data

See [data/README.md](data/README.md). The recall and NDC data is real public openFDA data. The inventory is synthetic.

## Limitations

- RecallGuard is decision support, not medical advice. Verify every action against the FDA notice and the firm's letter.
- It covers drug enforcement reports only (no device or food recalls). Serial-level checks are flagged for a human to do, not automated.
- openFDA data can lag official FDA notices by days.

## Pre-existing components (declared)

- `src/engines/hmem/`: the Meterless H-MEM reference implementation (Apache-2.0, © Meterless; see `src/engines/hmem/LICENSE`), used as the engine core.
- `tests/hmem-conformance/`: the Meterless H-MEM conformance suite, unmodified.

Everything else was written during the build window (22–27 Oct 2026).

## License

Apache-2.0
