import type { Queryable } from "./db/index.js";

export async function audit(
  q: Queryable,
  userId: string,
  action: string,
  target: string | null,
  detail: Record<string, unknown> | null = null,
): Promise<void> {
  await q.query("insert into audit_log (user_id, action, target, detail) values ($1, $2, $3, $4)", [
    userId,
    action,
    target,
    detail === null ? null : JSON.stringify(detail),
  ]);
}
