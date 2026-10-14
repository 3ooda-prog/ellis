import Anthropic from "@anthropic-ai/sdk";
import { SAVE_TOOL_NAME } from "../extraction/contract.js";
import { ProviderError, type ChatProvider, type ChatTurn, type ProviderRequest, type ProviderResult } from "./types.js";

export interface AnthropicProviderOptions {
  model: string;
  effort: "low" | "medium" | "high" | "xhigh" | "max";
  /** Required by keys that are not scoped to a workspace. */
  workspaceId?: string;
  client?: Anthropic;
}

/** The API wants alternating roles; merge any back-to-back turns (e.g. after a failed reply). */
export function alternate(turns: ChatTurn[]): Anthropic.Beta.BetaMessageParam[] {
  const out: Anthropic.Beta.BetaMessageParam[] = [];
  for (const t of turns) {
    const last = out[out.length - 1];
    if (last && last.role === t.role) last.content = `${last.content as string}\n\n${t.content}`;
    else out.push({ role: t.role, content: t.content });
  }
  while (out[0]?.role === "assistant") out.shift();
  return out;
}

export function createAnthropicProvider(opts: AnthropicProviderOptions): ChatProvider {
  const client =
    opts.client ??
    new Anthropic(opts.workspaceId ? { defaultHeaders: { "anthropic-workspace-id": opts.workspaceId } } : {});
  return {
    async converse(req: ProviderRequest, onText): Promise<ProviderResult> {
      try {
        const stream = client.beta.messages.stream(
          {
            model: opts.model,
            max_tokens: 16000,
            system: req.system,
            messages: alternate(req.messages),
            tools: [{ ...req.tool, eager_input_streaming: true }],
            tool_choice: { type: "auto" },
            output_config: { effort: opts.effort },
            // On a safety decline, the API re-runs the request on a fallback model it picks.
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
          },
          { signal: req.signal },
        );
        stream.on("text", onText);
        const msg = await stream.finalMessage();

        let text = "";
        let toolInput: unknown = undefined;
        for (const block of msg.content) {
          if (block.type === "text") text += block.text;
          else if (block.type === "tool_use" && block.name === SAVE_TOOL_NAME && toolInput === undefined) {
            toolInput = block.input;
          }
        }
        // With eager input streaming the API does not validate tool input, and a
        // max_tokens cut-off can leave it truncated. Never persist from that.
        const toolInputError =
          toolInput !== undefined && msg.stop_reason === "max_tokens" ? "tool input cut off at max_tokens" : undefined;

        return {
          text: text.trim(),
          toolInput: toolInputError ? undefined : toolInput,
          toolInputError,
          stopReason: msg.stop_reason ?? "unknown",
          model: msg.model,
          usage: { input_tokens: msg.usage.input_tokens, output_tokens: msg.usage.output_tokens },
        };
      } catch (err) {
        if (err instanceof Anthropic.RateLimitError) throw new ProviderError("rate limited", 429, true);
        if (err instanceof Anthropic.AuthenticationError) throw new ProviderError("provider authentication failed", 401, false);
        if (err instanceof Anthropic.BadRequestError) throw new ProviderError(`bad request: ${err.message}`, 400, false);
        if (err instanceof Anthropic.APIError) {
          const status = err.status ?? null;
          throw new ProviderError(`provider error: ${err.message}`, status, status === null || status >= 500);
        }
        throw err;
      }
    },
  };
}
