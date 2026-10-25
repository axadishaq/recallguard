import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Isolated, offline run: sample data, no model, throwaway memory.
const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "recallguard-test-"));
process.env.RECALLGUARD_STATE_DIR = stateDir;
process.env.SAMPLE_MODE = "true";
process.env.LLM_API_KEY = "";

const { ndc11ToPackageCandidates } = await import("../src/data/ndc.ts");
const { analyseLot } = await import("../src/agents/lots.ts");
const { runCheck, openMemory } = await import("../src/orchestrator.ts");
const { normaliseBaseUrl } = await import("../src/llm/client.ts");

test("11-digit shelf NDC maps to the three FDA 10-digit formats", () => {
  assert.deepEqual(ndc11ToPackageCandidates("29300018701"), ["29300-187-01", "29300-0187-1"]);
  assert.deepEqual(ndc11ToPackageCandidates("00615801505"), ["0615-8015-05", "00615-8015-5"]);
  assert.deepEqual(ndc11ToPackageCandidates("123"), []);
});

test("lot analysis reads FDA code_info", () => {
  assert.equal(analyseLot("Lot # GBHL24005A, Exp Date: 09/2026", "GBHL24005A").verdict, "lot_listed");
  assert.equal(analyseLot("Lot # GBHL24005A, Exp Date: 09/2026", "GBHL2400").verdict, "lot_not_listed");
  assert.equal(analyseLot("All lots within expiry.", "X1").verdict, "all_lots");
  assert.equal(analyseLot("Subset of Lot 2199821, Specific Serial Numbers being Recalled: 160R", "2199821").verdict, "partial_serials");
  assert.equal(analyseLot("", "X1").verdict, "unclear");
});

test("Nightshift base URL normalisation never produces /v1/v1", () => {
  assert.equal(normaliseBaseUrl("127.0.0.1:8088"), "http://127.0.0.1:8088/v1");
  assert.equal(normaliseBaseUrl("http://127.0.0.1:8088/v1/chat/completions"), "http://127.0.0.1:8088/v1");
  assert.equal(normaliseBaseUrl("http://localhost:8088/v1/"), "http://localhost:8088/v1");
});

test("end-to-end check flags the right shelf stock and adapts its plan", async () => {
  const { report, trace } = await runCheck("Weekly recall check of all shelf stock");
  const action = (sku: string) => report.findings.filter((f) => f.sku === sku && f.action !== "NO_ACTION").map((f) => f.action);
  assert.deepEqual(action("SKU-1002"), ["PULL_NOW"]); // Class I, all lots
  assert.deepEqual(action("SKU-1003"), ["PULL_NOW"]); // found only after plan revision
  assert.deepEqual(action("SKU-1005"), ["PULL_NOW"]);
  assert.deepEqual(action("SKU-1007"), ["PULL_NOW"]);
  assert.deepEqual(action("SKU-1001"), ["QUARANTINE_VERIFY_SERIALS"]);
  assert.deepEqual(action("SKU-1004"), []); // product recalled, our lot is not
  assert.deepEqual(action("SKU-1006"), []);
  assert.deepEqual(action("SKU-1010"), []); // routine stock
  assert.ok(report.planRevisions.length > 0, "Evaluator feedback should revise the plan");
  assert.ok(trace.events.some((e) => e.kind === "escalation"), "Class I findings escalate to the Risk agent");
  assert.equal(report.counts.new, 5);
});

test("H-MEM: a pharmacist's resolution suppresses the alert in the next session", async () => {
  openMemory().rememberResolution("SKU-1003", "D-0301-2026", "returned to supplier");
  const { report } = await runCheck("Weekly recall check of all shelf stock");
  const bisoprolol = report.findings.find((f) => f.sku === "SKU-1003" && f.recall_number === "D-0301-2026")!;
  assert.equal(bisoprolol.memory_status, "ALREADY_RESOLVED");
  assert.equal(report.findings.find((f) => f.sku === "SKU-1002")!.memory_status, "PREVIOUSLY_FLAGGED");
  assert.equal(report.counts.new, 0);
  assert.equal(report.counts.resolved, 1);
});

test("scoped request only checks matching stock", async () => {
  const { report } = await runCheck("Is our bisoprolol affected?");
  assert.ok(report.findings.length > 0);
  assert.ok(report.findings.every((f) => f.item_name.includes("BISOPROLOL")));
});
