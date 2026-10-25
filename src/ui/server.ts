// Minimal web UI: run a check, watch the agents work live (SSE), act on the
// findings, and record resolutions into H-MEM. Run: npm run ui
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { config } from "../config.ts";
import { openMemory, runCheck } from "../orchestrator.ts";
import { Trace } from "../trace.ts";

const PORT = Number(process.env.PORT ?? 3030);
const page = () => fs.readFileSync(path.join(import.meta.dirname, "index.html"), "utf-8");

function json(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req: http.IncomingMessage): Promise<any> {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  try {
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(page());
      return;
    }

    // Server-sent events: each trace event as it happens, then the report.
    if (req.method === "GET" && url.pathname === "/api/run") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
      const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      const trace = new Trace();
      trace.onEvent((e) => send("trace", e));
      try {
        const { report } = await runCheck(url.searchParams.get("q") || "Weekly recall check of all shelf stock", { trace });
        send("report", report);
      } catch (err) {
        send("failure", { message: (err as Error).message });
      }
      res.end();
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/resolve") {
      const { sku, recall_number, note } = await readBody(req);
      if (!sku || !recall_number) return json(res, 400, { error: "sku and recall_number required" });
      const m = openMemory().rememberResolution(sku, recall_number, note || "handled");
      return json(res, 200, { id: m.id, content: m.content });
    }

    if (req.method === "GET" && url.pathname === "/api/memory") {
      const mem = openMemory();
      const records = mem.hmem.store
        .all()
        .sort((a, b) => b.timestamp - a.timestamp)
        .map((m) => ({ id: m.id, content: m.content, layer: m.layer, type: m.type, confidence: m.confidence, source: m.source, tags: m.tags, timestamp: m.timestamp }));
      return json(res, 200, { records, ledger: mem.hmem.ledger.stats() });
    }

    if (req.method === "GET" && url.pathname === "/api/status") {
      return json(res, 200, { sampleMode: config.sampleMode, llm: Boolean(config.llm.apiKey), model: config.llm.model });
    }

    res.writeHead(404).end("not found");
  } catch (err) {
    json(res, 500, { error: (err as Error).message });
  }
});

server.listen(PORT, () => console.log(`RecallGuard UI on http://localhost:${PORT}`));
