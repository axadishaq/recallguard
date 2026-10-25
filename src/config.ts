import "dotenv/config";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const bool = (v: string | undefined, dflt: boolean) => (v == null || v === "" ? dflt : /^(1|true|yes)$/i.test(v));

export const config = {
  root: ROOT,
  // SAMPLE_MODE=true runs entirely offline: cached openFDA data in a local SQL
  // engine and deterministic agent fallbacks when no model is reachable.
  sampleMode: bool(process.env.SAMPLE_MODE, true),
  dataDir: path.join(ROOT, "data", "sample"),
  stateDir: process.env.RECALLGUARD_STATE_DIR ?? path.join(ROOT, ".state"),
  runsDir: path.join(ROOT, "runs"),

  zetaris: {
    baseUrl: process.env.ZETARIS_BASE_URL ?? "http://localhost:8888",
    orgId: process.env.ZETARIS_ORG_ID ?? "1",
    user: process.env.ZETARIS_USER ?? "",
    password: process.env.ZETARIS_PASSWORD ?? "",
    // Tables are referenced as <database>.<table>, e.g. recallguard.inventory
    database: process.env.ZETARIS_DATABASE ?? "recallguard",
    timeoutMs: Number(process.env.ZETARIS_TIMEOUT_MS ?? 60_000),
  },

  llm: {
    // Meterless Nightshift runtime (OpenAI-compatible). Leave LLM_API_KEY empty
    // to run with deterministic fallbacks only.
    baseUrl: process.env.LLM_BASE_URL ?? "http://127.0.0.1:8088/v1",
    apiKey: process.env.LLM_API_KEY ?? "",
    model: process.env.LLM_MODEL ?? "meterless/auto",
    fastModel: process.env.LLM_MODEL_FAST ?? process.env.LLM_MODEL ?? "meterless/fast",
    appId: "recallguard",
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS ?? 180_000),
  },

  maxIterations: Number(process.env.MAX_ITERATIONS ?? 3),
};
