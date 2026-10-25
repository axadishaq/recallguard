// Runs Meterless's official H-MEM conformance suite against the H-MEM module
// RecallGuard ships (src/engines/hmem). Run: npm run test:hmem
import path from "node:path";

process.env.HMEM_IMPL = path.resolve(import.meta.dirname, "..", "src", "engines", "hmem", "index.ts").replace(/\\/g, "/");
await import("../tests/hmem-conformance/runner.ts");
