// Gemini adapter against a fake streaming endpoint (no network).
import { describe, expect, it } from "vitest";
import { SAVE_TOOL } from "../src/extraction/contract.js";
import { createGeminiProvider, toGeminiContents, toGeminiSchema } from "../src/provider/gemini.js";
import { ProviderError } from "../src/provider/types.js";

function sse(chunks: object[], sep = "\r\n\r\n") {
  const body = chunks.map((c) => `data: ${JSON.stringify(c)}${sep}`).join("");
  // Split mid-event to prove the parser buffers across reads.
  const bytes = new TextEncoder().encode(body);
  const mid = Math.floor(bytes.length / 2);
  return new ReadableStream<Uint8Array>({
    start(c) { c.enqueue(bytes.slice(0, mid)); c.enqueue(bytes.slice(mid)); c.close(); },
  });
}

function fakeFetch(status: number, body: ReadableStream<Uint8Array> | string, seen: { url?: string; init?: RequestInit } = {}) {
  return (async (url: string, init: RequestInit) => {
    seen.url = url;
    seen.init = init;
    return new Response(body, { status });
  }) as unknown as typeof fetch;
}

const req = { system: "sys", messages: [{ role: "user" as const, content: "hi" }], tool: SAVE_TOOL };

describe("gemini adapter", () => {
  it("streams text, returns the tool call, and sends key, system and tool", async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    const p = createGeminiProvider({
      apiKey: "k", model: "gemini-test",
      fetch: fakeFetch(200, sse([
        { candidates: [{ content: { parts: [{ text: "thinking…", thought: true }] } }] },
        { candidates: [{ content: { parts: [{ text: "Got the " }] } }] },
        { candidates: [{ content: { parts: [{ text: "dentist." }, { functionCall: { name: "save_to_memory", args: { remember: [], done: [], forget: [] } } }] }, finishReason: "STOP" }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 }, modelVersion: "gemini-test-001" },
      ]), seen),
    });
    const deltas: string[] = [];
    const out = await p.converse(req, (d) => deltas.push(d));
    expect(deltas.join("")).toBe("Got the dentist.");
    expect(out).toMatchObject({ text: "Got the dentist.", stopReason: "end_turn", model: "gemini-test-001", toolInput: { remember: [] } });
    expect(out.usage).toEqual({ input_tokens: 10, output_tokens: 5 });
    expect(seen.url).toContain("/models/gemini-test:streamGenerateContent?alt=sse");
    expect((seen.init!.headers as Record<string, string>)["x-goog-api-key"]).toBe("k");
    const sent = JSON.parse(seen.init!.body as string);
    expect(sent.systemInstruction.parts[0].text).toBe("sys");
    expect(sent.tools[0].functionDeclarations[0].name).toBe("save_to_memory");
    expect(JSON.stringify(sent.tools)).not.toContain("additionalProperties");
  });

  it("drops the tool call when cut off or blocked", async () => {
    const cut = createGeminiProvider({ apiKey: "k", model: "m", fetch: fakeFetch(200, sse([
      { candidates: [{ content: { parts: [{ functionCall: { name: "save_to_memory", args: {} } }] }, finishReason: "MAX_TOKENS" }] },
    ], "\n\n")) });
    expect(await cut.converse(req, () => {})).toMatchObject({ toolInput: undefined, toolInputError: expect.any(String), stopReason: "max_tokens" });
    const blocked = createGeminiProvider({ apiKey: "k", model: "m", fetch: fakeFetch(200, sse([{ promptFeedback: { blockReason: "SAFETY" } }])) });
    expect(await blocked.converse(req, () => {})).toMatchObject({ stopReason: "refusal", toolInput: undefined });
  });

  it("maps HTTP errors: 429 retryable, 400 not", async () => {
    const limited = createGeminiProvider({ apiKey: "k", model: "m", fetch: fakeFetch(429, "quota") });
    await expect(limited.converse(req, () => {})).rejects.toMatchObject({ status: 429, retryable: true });
    const bad = createGeminiProvider({ apiKey: "k", model: "m", fetch: fakeFetch(400, "API key not valid") });
    const err = await bad.converse(req, () => {}).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err).toMatchObject({ status: 400, retryable: false });
  });

  it("converts schema and turns to Gemini's shapes", () => {
    const s = toGeminiSchema({ type: "object", additionalProperties: false, properties: { a: { type: "string", enum: ["", "x"] } } });
    expect(s).toEqual({ type: "object", properties: { a: { type: "string", enum: ["x"] } } });
    expect(toGeminiContents([
      { role: "assistant", content: "orphan" }, { role: "user", content: "a" }, { role: "user", content: "b" }, { role: "assistant", content: "c" },
    ])).toEqual([{ role: "user", parts: [{ text: "a\n\nb" }] }, { role: "model", parts: [{ text: "c" }] }]);
  });
});
