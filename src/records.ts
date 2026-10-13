import type { Queryable } from "./db/index.js";
import type { LiveRecord } from "./extraction/plan.js";

export interface RecordRow {
  id: string;
  kind: string;
  text: string;
  due_at: Date | null;
  area_key: string | null;
  status: string;
  confidence: string;
  sensitive: boolean;
  source_conversation_id: string | null;
  source_external: string | null;
  created_by_companion_id: string | null;
  supersedes_id: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
  closed_at: Date | null;
}

const SELECT = `
  select r.id, r.kind, r.text, r.due_at, a.key as area_key, r.status, r.confidence, r.sensitive,
         r.source_conversation_id, r.source_external, r.created_by_companion_id, r.supersedes_id,
         r.version, r.created_at, r.updated_at, r.closed_at
    from records r left join areas a on a.id = r.area_id`;

/** Every active or candidate record for a user, newest first. */
export async function loadLive(q: Queryable, userId: string): Promise<LiveRecord[]> {
  const { rows } = await q.query<LiveRecord>(
    `${SELECT} where r.user_id = $1 and r.status in ('active', 'candidate') order by r.created_at desc, r.id`,
    [userId],
  );
  return rows;
}

export async function listRecords(
  q: Queryable,
  userId: string,
  filter: { status?: string; kind?: string } = {},
): Promise<RecordRow[]> {
  const params: unknown[] = [userId];
  let where = "r.user_id = $1";
  if (filter.status) {
    params.push(filter.status);
    where += ` and r.status = $${params.length}`;
  } else {
    where += " and r.status <> 'deleted'";
  }
  if (filter.kind) {
    params.push(filter.kind);
    where += ` and r.kind = $${params.length}`;
  }
  const { rows } = await q.query<RecordRow>(`${SELECT} where ${where} order by r.created_at desc, r.id`, params);
  return rows;
}

export async function getRecord(q: Queryable, userId: string, id: string): Promise<RecordRow | null> {
  const { rows } = await q.query<RecordRow>(`${SELECT} where r.user_id = $1 and r.id = $2`, [userId, id]);
  return rows[0] ?? null;
}
