// Deterministic provider for tests: no network, scripted replies.

import type { ChatProvider, ProviderRequest, ProviderResult } from "./types.js";

export type StubReply = Partial<ProviderResult> & { text: string } | Error;

export interface StubProvider extends ChatProvider {
  requests: ProviderRequest[];
  push(...replies: StubReply[]): void;
}

export function createStubProvider(...initial: StubReply[]): StubProvider {
  const queue = [...initial];
  const requests: ProviderRequest[] = [];
  return {
    engine: "Claude",
    requests,
    push: (...r) => queue.push(...r),
    async converse(req, onText) {
      requests.push(req);
      const next = queue.shift() ?? { text: "Okay." };
      if (next instanceof Error) throw next;
      for (const chunk of next.text.match(/.{1,12}/gs) ?? []) onText(chunk);
      return { toolInput: undefined, stopReason: "end_turn", model: "stub", ...next };
    },
  };
}
