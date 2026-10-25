// CLI.
//   npm run check                                    full-shelf recall check
//   npm run check -- "is our bisoprolol affected?"   scoped check
//   npm run check -- --resolve SKU-1003 D-0301-2026 "returned to supplier"
//   npm run check -- --reset-memory

import fs from "node:fs";
import path from "node:path";
import { config } from "./config.ts";
import { openMemory, runCheck } from "./orchestrator.ts";

const COLORS: Record<string, string> = { plan: "36", sql: "90", llm: "35", decision: "37", feedback: "33", memory: "34", escalation: "31", fallback: "90", error: "31", output: "32" };

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] === "--reset-memory") {
    fs.rmSync(path.join(config.stateDir, "hmem"), { recursive: true, force: true });
    console.log("H-MEM state cleared.");
    return;
  }
  if (args[0] === "--resolve") {
    const [, sku, recall, ...note] = args;
    if (!sku || !recall) throw new Error('usage: --resolve <SKU> <RECALL_NUMBER> "note"');
    const m = openMemory().rememberResolution(sku, recall, note.join(" ") || "handled");
    console.log(`Remembered resolution ${m.id}: ${m.content}`);
    return;
  }

  const request = args.join(" ") || "Weekly recall check of all shelf stock";
  const { report, markdown, trace, traceFile } = await runCheck(request, {
    trace: undefined,
  });
  for (const e of trace.events) {
    console.log(`\x1b[${COLORS[e.kind] ?? "37"}m[${String(e.t).padStart(5)}ms] ${e.agent.padEnd(12)} ${e.kind.padEnd(10)} ${e.message}${e.model ? ` {model: ${e.model}}` : ""}\x1b[0m`);
  }
  console.log("\n" + markdown);
  console.log(`trace: ${traceFile}`);
  console.log(`report: ${path.join(config.runsDir, `${report.runId}.report.md`)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
