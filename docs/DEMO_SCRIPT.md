# Demo video script (target 3:00, hard limit 4:00)

**Before recording**
- Run `npm run check -- --reset-memory` so session 1 starts clean.
- Run `npm run ui` and open http://localhost:3030 in a clean browser window, zoomed to 110–125%.
- Live mode (if ready): `.env` has `SAMPLE_MODE=false`, the Zetaris tables are registered, Nightshift is running with a Nemotron route, and the header pills show "Data: Zetaris" and "AI: Nightshift · …".
- Have the Zetaris GUI (http://localhost:9001) open in a second tab, showing the `recallguard` tables.
- Record at 1080p. Narrate over the screen. Show your face only if you want to.

| Time | Screen | Say |
|---|---|---|
| 0:00–0:20 | Deck slide 2 (problem) | "Independent pharmacies have to match FDA drug recalls to their shelf by hand. Recalls list lots in free text, NDC formats don't match, and nothing remembers what was already handled. RecallGuard is a team of agents that does this, with evidence." |
| 0:20–0:35 | Zetaris GUI, `recallguard` database | "The data layer is Zetaris. It federates four sources: our pharmacy's inventory export and three openFDA tables: 1,400 real recall reports, the NDC directory, and recall-to-NDC links." |
| 0:35–1:20 | RecallGuard UI → click **Run check**; the trace streams | "I ask for the weekly check. Watch the trace. The Planner scopes the request, and the Matcher runs SQL through Zetaris. Here the Evaluator pushes back: one shelf item isn't in the NDC directory. The Planner revises the plan, adds two steps, and the next iteration finds a nitrosamine recall on our bisoprolol. Class I recalls escalate to the Risk agent. Each model call shows which Nightshift model handled it." |
| 1:20–2:00 | Action cards | "The result is a cited action list. Pull the nasal spray now: the FDA text says 'all lots'. Quarantine the pegfilgrastim, because only specific serial numbers are recalled. And clevipidine is cleared: the product is recalled, but not our lot, so a name-matching tool would have pulled it for nothing. Every card quotes the FDA lot text and links the record." |
| 2:00–2:35 | Click **Mark resolved…** on bisoprolol → type "returned to supplier, credit memo CM-4471" → save → **Run check** again | "This is the Meterless H-MEM engine. I mark bisoprolol resolved, and that goes into long-term memory as a correction. On the next check it's suppressed, and the other four show as previously flagged, so the pharmacist only sees what's new or still open." |
| 2:35–2:50 | Terminal: `npm run test:hmem` then `npm test` | "H-MEM passes Meterless's official conformance suite, 13 of 13, and our tests assert the cross-session behavior." |
| 2:50–3:00 | Deck slide 15 (close) | "RecallGuard: the right lot, pulled the same day, with the evidence attached. The code is on GitHub and runs offline in sample mode." |

**If live services aren't ready:** record in sample mode (the pills say "sample") and say so plainly: "This run uses the cached openFDA sample; in live mode the same SQL runs on Zetaris." Don't present sample mode as live.
