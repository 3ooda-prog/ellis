// The conversation loop (handover §4): one model call per user message.
//
//   load context → one streamed completion → persist reply → validate and
//   persist the save_to_memory call → return receipts
//
// The reply always reaches the user, even when extraction is malformed or
// fails to write; extraction problems are logged and audited, never shown.

import { audit } from "../audit.js";
import type { Db } from "../db/index.js";
import { applyPlan, type Receipt } from "../extraction/apply.js";
import { SAVE_TOOL } from "../extraction/contract.js";
import { planExtraction } from "../extraction/plan.js";
import { buildSystemPrompt } from "./prompt.js";
import { ProviderError, type ChatProvider, type ChatTurn } from "../provider/types.js";
import { loadLive } from "../records.js";
import { retrieve } from "../retrieval/score.js";
import type { AreaKey, User } from "../users.js";

export const CONVERSATION_GAP_MS = 45 * 60_000;
export const CONTEXT_TURNS = 12;
const REFUSAL_REPLY = "I can't help with that one, but I'm here for anything else.";
const EMPTY_REPLY = "Got it.";

export interface Logger {
  info(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

export interface ChatDeps {
  db: Db;
  provider: ChatProvider;
  log: Logger;
  clock?: () => Date;
}

export interface ChatInput {
  user: User;
  message: string;
  companionId?: string;
  source?: "text" | "voice";
  signal?: AbortSignal;
}

export type ChatEvent =
  | { type: "start"; conversation_id: string; companion_id: string }
  | { type: "delta"; text: string }
  | { type: "receipts"; receipts: Receipt[] }
  | { type: "error"; error: string; retryable: boolean }
  | { type: "done"; conversation_id: string; reply: string };

export class NotFoundError extends Error {}

interface Companion {
  id: string;
  name: string;
  role: string;
  persona: string;
  area_key: string | null;
}

async function resolveCompanion(db: Db, userId: string, companionId?: string): Promise<Companion> {
  const { rows } = await db.query<Companion>(
    `select c.id, c.name, c.role, c.persona, a.key as area_key
       from companions c left join areas a on a.id = c.area_id
      where c.user_id = $1 and ${companionId ? "c.id = $2" : "c.is_primary"}`,
    companionId ? [userId, companionId] : [userId],
  );
  if (!rows[0]) throw new NotFoundError("companion not found");
  return rows[0];
}

/** The open conversation with this companion, or a new one after a 45-minute gap. */
async function currentConversation(db: Db, userId: string, companionId: string, now: Date): Promise<string> {
  const { rows } = await db.query<{ id: string; last_at: Date }>(
    `select c.id, coalesce(max(t.created_at), c.started_at) as last_at
       from conversations c left join turns t on t.conversation_id = c.id
      where c.user_id = $1 and c.companion_id = $2 and c.ended_at is null
      group by c.id
      order by last_at desc
      limit 1`,
    [userId, companionId],
  );
  const open = rows[0];
  if (open && now.getTime() - open.last_at.getTime() < CONVERSATION_GAP_MS) return open.id;
  if (open) await db.query("update conversations set ended_at = $2 where id = $1", [open.id, open.last_at]);
  const created = await db.query<{ id: string }>(
    "insert into conversations (user_id, companion_id, started_at) values ($1, $2, $3) returning id",
    [userId, companionId, now],
  );
  return created.rows[0]!.id;
}

async function insertTurn(db: Db, conversationId: string, role: "user" | "assistant", content: string, source: string, at: Date) {
  await db.query(
    "insert into turns (conversation_id, role, content, source, created_at) values ($1, $2, $3, $4, $5)",
    [conversationId, role, content, source, at],
  );
}

export async function handleMessage(
  deps: ChatDeps,
  input: ChatInput,
  emit: (e: ChatEvent) => void,
): Promise<{ conversationId: string; reply: string | null; receipts: Receipt[] }> {
  const { db, provider, log } = deps;
  const clock = deps.clock ?? (() => new Date());
  const { user } = input;
  const now = clock();

  const companion = await resolveCompanion(db, user.id, input.companionId);
  const conversationId = await currentConversation(db, user.id, companion.id, now);
  emit({ type: "start", conversation_id: conversationId, companion_id: companion.id });

  await insertTurn(db, conversationId, "user", input.message, input.source ?? "text", now);

  const history = (
    await db.query<ChatTurn>(
      `select role, content from turns where conversation_id = $1 order by created_at desc, id desc limit $2`,
      [conversationId, CONTEXT_TURNS],
    )
  ).rows.reverse();

  const live = await loadLive(db, user.id);
  const areas = (
    await db.query<{ key: string; name: string }>(
      "select key, name from areas where user_id = $1 and status = 'active' order by key",
      [user.id],
    )
  ).rows;
  const relevant = retrieve(live, { message: input.message, now, homeAreaKey: companion.area_key });
  const system = buildSystemPrompt({ companion, areas, records: relevant, now, timezone: user.timezone, engine: provider.engine });

  let result;
  try {
    result = await provider.converse({ system, messages: history, tool: SAVE_TOOL, signal: input.signal }, (text) =>
      emit({ type: "delta", text }),
    );
  } catch (err) {
    const pe = err instanceof ProviderError ? err : null;
    log.error({ err, conversationId }, "provider call failed");
    await audit(db, user.id, "provider.error", conversationId, { message: String((err as Error).message ?? err) });
    emit({ type: "error", error: "The assistant is unavailable right now. Your message was saved.", retryable: pe?.retryable ?? true });
    return { conversationId, reply: null, receipts: [] };
  }

  let reply = result.text;
  const refused = result.stopReason === "refusal";
  if (refused && !reply) reply = REFUSAL_REPLY;
  if (!reply) reply = EMPTY_REPLY;
  if (reply !== result.text) emit({ type: "delta", text: reply });
  const replyAt = new Date(Math.max(clock().getTime(), now.getTime() + 1));
  await insertTurn(db, conversationId, "assistant", reply, "text", replyAt);

  let receipts: Receipt[] = [];
  if (result.toolInputError) {
    await recordExtractionError(deps, user.id, conversationId, result.toolInputError);
  } else if (result.toolInput !== undefined && !refused) {
    receipts = await extract(deps, user, companion.id, conversationId, result.toolInput);
  }

  emit({ type: "receipts", receipts });
  emit({ type: "done", conversation_id: conversationId, reply });
  return { conversationId, reply, receipts };
}

async function extract(
  deps: ChatDeps,
  user: User,
  companionId: string,
  conversationId: string,
  raw: unknown,
): Promise<Receipt[]> {
  try {
    return await deps.db.transaction(async (tx) => {
      // Re-read inside the transaction so the plan is built from current versions.
      const live = await loadLive(tx, user.id);
      const areaNames = Object.fromEntries(
        (await tx.query<{ key: AreaKey; name: string }>("select key, name from areas where user_id = $1", [user.id])).rows.map(
          (a) => [a.name.toLowerCase(), a.key],
        ),
      );
      const planned = planExtraction(raw, { live, timezone: user.timezone, areaNames });
      if (!planned.ok) throw new ExtractionRejected(planned.error);
      return applyPlan(tx, planned.plan, { userId: user.id, conversationId, companionId });
    });
  } catch (err) {
    await recordExtractionError(deps, user.id, conversationId, String((err as Error).message ?? err), raw);
    return [];
  }
}

class ExtractionRejected extends Error {}

async function recordExtractionError(deps: ChatDeps, userId: string, conversationId: string, error: string, raw?: unknown) {
  deps.log.error({ conversationId, error }, "extraction not saved");
  // Keep the raw payload out of the audit log: it may contain sensitive text.
  await audit(deps.db, userId, "extraction.error", conversationId, {
    error,
    raw_type: raw === undefined ? null : Array.isArray(raw) ? "array" : typeof raw,
  });
}
