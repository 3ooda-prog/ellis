// The provider boundary. Conversation code depends only on this interface,
// so the model vendor can change without touching validation or storage.

import type { SAVE_TOOL } from "../extraction/contract.js";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ProviderRequest {
  system: string;
  messages: ChatTurn[];
  tool: typeof SAVE_TOOL;
  signal?: AbortSignal;
}

export interface ProviderResult {
  /** The spoken reply. */
  text: string;
  /** Input of the save tool call, if the model made one. Unvalidated. */
  toolInput: unknown;
  /** Set when a tool call was made but its input cannot be trusted (e.g. cut off). */
  toolInputError?: string;
  stopReason: string;
  model: string;
  usage?: { input_tokens: number; output_tokens: number };
}

export interface ChatProvider {
  /** The model family's name, as the companion may truthfully describe itself. */
  engine: string;
  converse(req: ProviderRequest, onText: (delta: string) => void): Promise<ProviderResult>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
