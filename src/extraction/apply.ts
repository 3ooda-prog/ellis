// Persist a validated Plan. Runs inside the caller's transaction.
// Every status change is conditional on the version the plan was built from,
// so a record edited concurrently (another tab, another request) is skipped
// rather than silently overwritten.

import { audit } from "../audit.js";
import type { Queryable } from "../db/index.js";
import type { LiveRecord, Plan } from "./plan.js";

export interface Receipt {
  action: "saved" | "unconfirmed" | "corrected" | "completed" | "forgotten";
  record: { id: string; kind: string; text: string; due_at: Date | null; area: string | null };
  replaced?: { id: string; text: string };
}

export interface Provenance {
  userId: string;
  conversationId: string | null;
  companionId: string | null;
}

async function closeRecord(
  tx: Queryable,
  userId: string,
  r: LiveRecord,
  status: "superseded" | "done",
): Promise<boolean> {
  const res = await tx.query(
    `update records
        set status = $4, closed_at = now(), updated_at = now(), version = version + 1
      where id = $1 and user_id = $2 and version = $3 and status in ('active', 'candidate')`,
    [r.id, userId, r.version, status],
  );
  return res.rowCount === 1;
}

const view = (r: { id: string; kind: string; text: string; due_at: Date | null; area_key: string | null }) => ({
  id: r.id,
  kind: r.kind,
  text: r.text,
  due_at: r.due_at,
  area: r.area_key,
});

export async function applyPlan(tx: Queryable, plan: Plan, prov: Provenance): Promise<Receipt[]> {
  const { userId } = prov;
  const receipts: Receipt[] = [];
  const notes = [...plan.notes];

  // Close superseded records first so a corrected record may reuse similar wording
  // without tripping the live-text unique index.
  const superseded = new Set<string>();
  for (const c of plan.creates) {
    if (!c.supersedes) continue;
    if (await closeRecord(tx, userId, c.supersedes, "superseded")) {
      superseded.add(c.supersedes.id);
    } else {
      notes.push(`record ${c.supersedes.id} changed concurrently; not superseded`);
    }
  }

  for (const c of plan.creates) {
    const supersedesId = c.supersedes && superseded.has(c.supersedes.id) ? c.supersedes.id : null;
    const { rows } = await tx.query<{ id: string; kind: string; text: string; due_at: Date | null }>(
      `insert into records (user_id, kind, text, due_at, area_id, status, confidence, sensitive,
                            source_conversation_id, created_by_companion_id, supersedes_id)
       values ($1, $2, $3, $4, (select id from areas where user_id = $1 and key = $5), $6, $7, $8, $9, $10, $11)
       on conflict do nothing
       returning id, kind, text, due_at`,
      [userId, c.kind, c.text, c.dueAt, c.areaKey, c.status, c.confidence, c.sensitive,
       prov.conversationId, prov.companionId, supersedesId],
    );
    const row = rows[0];
    if (!row) {
      // Lost a race with a concurrent insert of the same wording.
      notes.push(`"${c.text}" already saved concurrently; dropped`);
      continue;
    }
    await audit(tx, userId, "record.create", row.id, {
      kind: c.kind,
      status: c.status,
      conversation_id: prov.conversationId,
      supersedes_id: supersedesId,
    });
    if (supersedesId) await audit(tx, userId, "record.supersede", supersedesId, { replaced_by: row.id });
    receipts.push({
      action: supersedesId ? "corrected" : c.status === "candidate" ? "unconfirmed" : "saved",
      record: view({ ...row, area_key: c.areaKey }),
      ...(supersedesId && c.supersedes ? { replaced: { id: c.supersedes.id, text: c.supersedes.text } } : {}),
    });
  }

  for (const r of plan.complete) {
    if (!(await closeRecord(tx, userId, r, "done"))) {
      notes.push(`record ${r.id} changed concurrently; not marked done`);
      continue;
    }
    await audit(tx, userId, "record.done", r.id, { conversation_id: prov.conversationId });
    receipts.push({ action: "completed", record: view(r) });
  }

  for (const r of plan.forget) {
    if (!(await closeRecord(tx, userId, r, "superseded"))) {
      notes.push(`record ${r.id} changed concurrently; not forgotten`);
      continue;
    }
    await audit(tx, userId, "record.forget", r.id, { conversation_id: prov.conversationId });
    receipts.push({ action: "forgotten", record: view(r) });
  }

  if (notes.length) await audit(tx, userId, "extraction.notes", prov.conversationId, { notes });
  return receipts;
}
