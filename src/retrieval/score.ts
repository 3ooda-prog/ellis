// Relevance scoring (handover §5). Baseline keyword + recency scorer; swap
// for embeddings once the corpus justifies it. Pure, so it is tested directly.

import type { LiveRecord } from "../extraction/plan.js";

export const TOP_K = 28;
const DAY = 86_400_000;

const STOPWORDS = new Set(
  ("about above after again against also because been before being below between both could does doing during " +
    "each from further have having here into itself just more most must once only other ought ours over same " +
    "should some such than that their theirs them then there these they this those through under until very " +
    "were what when where which while whom with would your yours yourself really think going want need know " +
    "like will")
    .split(" "),
);

export function keywords(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of text.toLowerCase().normalize("NFKD").split(/[^\p{L}\p{N}]+/u)) {
    if (w.length > 3 && !STOPWORDS.has(w)) out.add(w);
  }
  return out;
}

export interface ScoreContext {
  message: string;
  now: Date;
  homeAreaKey: string | null;
}

export function score(r: LiveRecord, ctx: ScoreContext, msgWords = keywords(ctx.message)): number {
  let s = 0;
  for (const w of keywords(r.text)) if (msgWords.has(w)) s += 3;
  if (r.kind === "task") s += 2;
  if (r.kind === "decision") s += 1;
  if (r.kind === "event" && r.due_at) {
    const until = r.due_at.getTime() - ctx.now.getTime();
    if (until >= 0 && until <= 7 * DAY) s += 4;
  }
  if (ctx.homeAreaKey && r.area_key === ctx.homeAreaKey) s += 2;
  const ageDays = (ctx.now.getTime() - r.created_at.getTime()) / DAY;
  s += Math.max(0, 3 - ageDays / 14);
  if (r.status === "candidate") s -= 1;
  return s;
}

/** Events this close are always included, whatever their score (handover §9). */
export const PINNED_EVENT_WINDOW_MS = 2 * DAY;

/**
 * Top-k live records for this message, best first. Events due in the next
 * 48 hours are pinned ahead of scored records so they cannot be crowded out
 * by fresh tasks. Ties go to the newer record.
 */
export function retrieve(live: LiveRecord[], ctx: ScoreContext, k = TOP_K): LiveRecord[] {
  const msgWords = keywords(ctx.message);
  const isPinned = (r: LiveRecord) => {
    if (r.kind !== "event" || !r.due_at) return false;
    const until = r.due_at.getTime() - ctx.now.getTime();
    return until >= 0 && until <= PINNED_EVENT_WINDOW_MS;
  };
  return live
    .filter((r) => r.status === "active" || r.status === "candidate")
    .map((r) => ({ r, pinned: isPinned(r), s: score(r, ctx, msgWords) }))
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) || b.s - a.s || b.r.created_at.getTime() - a.r.created_at.getTime(),
    )
    .slice(0, k)
    .map((x) => x.r);
}
