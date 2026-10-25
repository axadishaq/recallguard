// Meterless Nightshift runtime as an OpenAI-compatible provider (contract:
// docs/agent-ready/add-meterless-provider.md, runtime 0.90.0). Every call is
// traced with the model that actually served it, as the hackathon requires.

import { config } from "../config.ts";
import type { Trace } from "../trace.ts";

export function normaliseBaseUrl(raw: string): string {
  let url = raw.trim();
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  url = url.replace(/\/+$/, "").replace(/\/(v1\/)?(chat\/completions|models|healthz)$/i, "").replace(/\/v1$/i, "");
  return `${url}/v1`;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class LlmClient {
  private disabledReason?: string;

  constructor(private trace: Trace) {
    if (!config.llm.apiKey) this.disabledReason = "no LLM_API_KEY (Nightshift proxy-token) configured";
  }

  get available(): boolean {
    return !this.disabledReason;
  }

  // Returns null when no model is reachable so callers take their
  // deterministic path; the trace records why.
  async chat(agent: string, messages: ChatMessage[], opts: { fast?: boolean; json?: boolean } = {}): Promise<string | null> {
    if (this.disabledReason) return null;
    const model = opts.fast ? config.llm.fastModel : config.llm.model;
    const started = Date.now();
    try {
      const res = await fetch(`${normaliseBaseUrl(config.llm.baseUrl)}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.llm.apiKey}`,
          "meterless-app": config.llm.appId,
          "meterless-scope": "user",
        },
        body: JSON.stringify({ model, messages, temperature: 0.1, max_tokens: 1200 }),
        signal: AbortSignal.timeout(config.llm.timeoutMs),
      });
      if (res.status === 401 || res.status === 403) {
        this.disabledReason = `Nightshift rejected the token (HTTP ${res.status})`;
        throw new Error(this.disabledReason);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      const body = (await res.json()) as { model?: string; choices: { message: { content: string } }[]; usage?: unknown };
      const text = body.choices?.[0]?.message?.content ?? "";
      this.trace.log(agent, "llm", `model call ok (${Date.now() - started} ms)`, {
        model: body.model ?? model,
        data: { requested: model, usage: body.usage },
      });
      return text;
    } catch (err) {
      this.trace.log(agent, "fallback", `model call failed (${(err as Error).message}); using deterministic logic`, { model });
      return null;
    }
  }

  async json<T>(agent: string, messages: ChatMessage[], opts: { fast?: boolean } = {}): Promise<T | null> {
    const text = await this.chat(agent, messages, { ...opts, json: true });
    if (text == null) return null;
    return parseJsonLoose<T>(text);
  }
}

export function parseJsonLoose<T>(text: string): T | null {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.search(/[[{]/);
  if (start < 0) return null;
  const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
