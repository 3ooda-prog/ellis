// Pure validation of model-proposed records (handover §2.3 and §4).
// Ports the prototype's applyMemory() discipline: whitelist kind, coerce
// undated events into tasks, drop empty text, dedupe case-insensitively,
// clamp lengths. No I/O here, so every rule is unit-testable.

import { parseLocalDateTime } from "../time.js";
import { AREA_KEYS, type AreaKey } from "../users.js";
import { KINDS, type Kind } from "./contract.js";

export const MAX_TEXT = 500;
const MIN_MATCH = 3; // shortest phrase that may close or forget a record by substring

export interface LiveRecord {
  id: string;
  kind: Kind;
  text: string;
  status: "active" | "candidate";
  version: number;
  area_key: string | null;
  due_at: Date | null;
  created_at: Date;
}

export interface NewRecord {
  kind: Kind;
  text: string;
  dueAt: Date | null;
  areaKey: AreaKey | null;
  status: "active" | "candidate";
  confidence: "explicit" | "inferred";
  sensitive: boolean;
  supersedes: LiveRecord | null;
}

export interface Plan {
  creates: NewRecord[];
  complete: LiveRecord[];
  forget: LiveRecord[];
  /** Human-readable notes on anything coerced or dropped; goes to the audit log. */
  notes: string[];
}

export type PlanResult = { ok: true; plan: Plan } | { ok: false; error: string };

export interface PlanContext {
  live: LiveRecord[]; // newest first
  timezone: string;
  /** Lowercased area display names → key, so "DesignEase" maps to "design". */
  areaNames?: Record<string, AreaKey>;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const key = (s: string) => norm(s).toLowerCase();

export function planExtraction(raw: unknown, ctx: PlanContext): PlanResult {
  if (!isObj(raw)) return { ok: false, error: "extraction is not a JSON object" };
  for (const field of ["remember", "done", "forget"] as const) {
    if (raw[field] !== undefined && !Array.isArray(raw[field])) {
      return { ok: false, error: `extraction.${field} is not an array` };
    }
  }
  const remember = (raw.remember as unknown[] | undefined) ?? [];
  const done = (raw.done as unknown[] | undefined) ?? [];
  const forget = (raw.forget as unknown[] | undefined) ?? [];

  const notes: string[] = [];
  const plan: Plan = { creates: [], complete: [], forget: [], notes };
  const claimed = new Set<string>(); // live record ids already being changed by this plan
  const liveTexts = new Set(ctx.live.map((r) => key(r.text)));
  const batchTexts = new Set<string>();

  for (const [i, item] of remember.entries()) {
    if (!isObj(item)) {
      notes.push(`remember[${i}]: not an object, dropped`);
      continue;
    }
    let text = norm(str(item.text));
    if (!text) {
      notes.push(`remember[${i}]: empty text, dropped`);
      continue;
    }
    if (text.length > MAX_TEXT) {
      notes.push(`remember[${i}]: text clamped from ${text.length} to ${MAX_TEXT} chars`);
      text = text.slice(0, MAX_TEXT - 1).trimEnd() + "…";
    }

    let kind = str(item.kind) as Kind;
    if (!KINDS.includes(kind)) {
      notes.push(`remember[${i}]: unknown kind "${str(item.kind)}", stored as fact`);
      kind = "fact";
    }

    const when = str(item.when).trim();
    let dueAt = when ? parseLocalDateTime(when, ctx.timezone) : null;
    if (when && !dueAt) notes.push(`remember[${i}]: unparseable when "${when}" ignored`);
    if (kind === "event" && !dueAt) {
      notes.push(`remember[${i}]: event without a date, stored as task`);
      kind = "task";
    }
    if (kind === "fact" || kind === "decision") dueAt = null;

    const supersedes = resolveReplaces(str(item.replaces), ctx.live, claimed);
    if (str(item.replaces).trim() && !supersedes) {
      notes.push(`remember[${i}]: replaces "${str(item.replaces)}" matched nothing live`);
    }

    const k = key(text);
    // Also catches "replacing" a record with its own wording, which is not a correction.
    if (liveTexts.has(k) || batchTexts.has(k)) {
      notes.push(`remember[${i}]: duplicate of an existing record, dropped`);
      continue;
    }
    batchTexts.add(k);
    if (supersedes) claimed.add(supersedes.id);

    const certain = item.certain !== false;
    plan.creates.push({
      kind,
      text,
      dueAt,
      areaKey: resolveArea(str(item.area), ctx.areaNames),
      status: certain ? "active" : "candidate",
      confidence: certain ? "explicit" : "inferred",
      sensitive: item.sensitive === true,
      supersedes,
    });
  }

  for (const phrase of done) {
    const target = matchLive(str(phrase), ctx.live, claimed, (r) => r.kind === "task" || r.kind === "event");
    if (!target) {
      notes.push(`done "${str(phrase)}": no live task matched`);
      continue;
    }
    claimed.add(target.id);
    plan.complete.push(target);
  }

  for (const phrase of forget) {
    const target = matchLive(str(phrase), ctx.live, claimed, () => true);
    if (!target) {
      notes.push(`forget "${str(phrase)}": no live record matched`);
      continue;
    }
    claimed.add(target.id);
    plan.forget.push(target);
  }

  return { ok: true, plan };
}

function resolveArea(value: string, names: Record<string, AreaKey> = {}): AreaKey | null {
  const v = key(value);
  if (!v) return null;
  if ((AREA_KEYS as readonly string[]).includes(v)) return v as AreaKey;
  return names[v] ?? null;
}

function resolveReplaces(ref: string, live: LiveRecord[], claimed: Set<string>): LiveRecord | null {
  return matchLive(ref, live, claimed, () => true);
}

/**
 * Find the live record a reference points at: exact id first, then a
 * case-insensitive substring of its text. When several match, the newest wins
 * (live is ordered newest first).
 */
function matchLive(
  ref: string,
  live: LiveRecord[],
  claimed: Set<string>,
  eligible: (r: LiveRecord) => boolean,
): LiveRecord | null {
  const r = key(ref);
  if (!r) return null;
  const pool = live.filter((x) => !claimed.has(x.id) && eligible(x));
  const byId = pool.find((x) => x.id.toLowerCase() === r);
  if (byId) return byId;
  if (r.length < MIN_MATCH) return null;
  return pool.find((x) => key(x.text).includes(r)) ?? null;
}
