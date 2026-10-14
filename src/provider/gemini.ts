// Google Gemini adapter, over the Gemini REST API (streamGenerateContent, SSE).
// Same contract as the Anthropic adapter: stream the spoken reply, return the
// save_to_memory call's arguments unvalidated. The server validates them.

import { SAVE_TOOL_NAME } from "../extraction/contract.js";
import { ProviderError, type ChatProvider, type ChatTurn, type ProviderRequest, type ProviderResult } from "./types.js";

export interface GeminiProviderOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

/**
 * Gemini accepts an OpenAPI subset for function parameters: no
 * additionalProperties, and string enums may not contain "". Strip both;
 * the server-side validator enforces the real rules anyway.
 */
export function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (!schema || typeof schema !== "object") return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === "additionalProperties") continue;
    if (k === "enum" && Array.isArray(v)) {
      const values = v.filter((x) => x !== "");
      if (values.length) out.enum = values;
      continue;
    }
    out[k] = toGeminiSchema(v);
  }
  return out;
}

/** Gemini wants alternating user/model turns, starting with the user. */
export function toGeminiContents(turns: ChatTurn[]) {
  const out: { role: "user" | "model"; parts: { text: string }[] }[] = [];
  for (const t of turns) {
    const role = t.role === "assistant" ? "model" : "user";
    const last = out[out.length - 1];
    if (last && last.role === role) last.parts[0]!.text += `\n\n${t.content}`;
    else out.push({ role, parts: [{ text: t.content }] });
  }
  while (out[0]?.role === "model") out.shift();
  return out;
}

interface GeminiChunk {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean; functionCall?: { name: string; args?: unknown } }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  modelVersion?: string;
}

export function createGeminiProvider(opts: GeminiProviderOptions): ChatProvider {
  const doFetch = opts.fetch ?? fetch;
  const base = opts.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta";
  return {
    engine: "Gemini",
    async converse(req: ProviderRequest, onText): Promise<ProviderResult> {
      const body = {
        systemInstruction: { parts: [{ text: req.system }] },
        contents: toGeminiContents(req.messages),
        tools: [
          {
            functionDeclarations: [
              { name: req.tool.name, description: req.tool.description, parameters: toGeminiSchema(req.tool.input_schema) },
            ],
          },
        ],
        toolConfig: { functionCallingConfig: { mode: "AUTO" } },
        generationConfig: { maxOutputTokens: 8192 },
      };

      let res: Response;
      try {
        res = await doFetch(`${base}/models/${encodeURIComponent(opts.model)}:streamGenerateContent?alt=sse`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": opts.apiKey },
          body: JSON.stringify(body),
          signal: req.signal,
        });
      } catch (err) {
        if ((err as Error).name === "AbortError") throw err;
        throw new ProviderError(`gemini unreachable: ${(err as Error).message}`, null, true);
      }
      if (!res.ok) {
        const detail = (await res.text().catch(() => "")).slice(0, 500);
        const retryable = res.status === 429 || res.status >= 500;
        throw new ProviderError(`gemini ${res.status}: ${detail}`, res.status, retryable);
      }

      let text = "";
      let toolInput: unknown = undefined;
      let finish = "unknown";
      let blocked = false;
      let usage: ProviderResult["usage"];
      let model = opts.model;

      const handle = (chunk: GeminiChunk) => {
        if (chunk.promptFeedback?.blockReason) blocked = true;
        if (chunk.modelVersion) model = chunk.modelVersion;
        if (chunk.usageMetadata) {
          usage = {
            input_tokens: chunk.usageMetadata.promptTokenCount ?? 0,
            output_tokens: chunk.usageMetadata.candidatesTokenCount ?? 0,
          };
        }
        const cand = chunk.candidates?.[0];
        if (cand?.finishReason) finish = cand.finishReason;
        for (const part of cand?.content?.parts ?? []) {
          if (part.thought) continue; // thinking summaries are not the reply
          if (typeof part.text === "string" && part.text) {
            text += part.text;
            onText(part.text);
          } else if (part.functionCall?.name === SAVE_TOOL_NAME && toolInput === undefined) {
            toolInput = part.functionCall.args ?? {};
          }
        }
      };

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let m;
        while ((m = /\r?\n\r?\n/.exec(buf))) {
          const block = buf.slice(0, m.index);
          buf = buf.slice(m.index + m[0].length);
          const data = block
            .split(/\r?\n/)
            .filter((l) => l.startsWith("data:"))
            .map((l) => l.slice(5).trim())
            .join("");
          if (data) handle(JSON.parse(data) as GeminiChunk);
        }
      }

      const safetyStop = blocked || finish === "SAFETY" || finish === "PROHIBITED_CONTENT" || finish === "BLOCKLIST";
      const cutOff = finish === "MAX_TOKENS";
      return {
        text: text.trim(),
        toolInput: safetyStop || cutOff ? undefined : toolInput,
        toolInputError: cutOff && toolInput !== undefined ? "tool input cut off at max tokens" : undefined,
        stopReason: safetyStop ? "refusal" : cutOff ? "max_tokens" : finish === "STOP" ? "end_turn" : finish.toLowerCase(),
        model,
        usage,
      };
    },
  };
}
