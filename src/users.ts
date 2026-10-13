import { createHash, randomBytes } from "node:crypto";
import type { Db, Queryable } from "./db/index.js";
import { isValidTimeZone } from "./time.js";

export const AREA_KEYS = ["design", "family", "houses", "priorities", "trading", "coding"] as const;
export type AreaKey = (typeof AREA_KEYS)[number];

const DEFAULT_AREA_NAMES: Record<AreaKey, string> = {
  design: "Design",
  family: "Family",
  houses: "Houses",
  priorities: "Priorities",
  trading: "Trading",
  coding: "Coding",
};

export interface User {
  id: string;
  email: string;
  timezone: string;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Issue a new bearer token. The plaintext is returned once and never stored. */
export async function issueToken(q: Queryable, userId: string, label = ""): Promise<string> {
  const token = `ellis_${randomBytes(32).toString("base64url")}`;
  await q.query("insert into auth_tokens (user_id, token_hash, label) values ($1, $2, $3)", [
    userId,
    hashToken(token),
    label,
  ]);
  return token;
}

export async function userForToken(q: Queryable, token: string): Promise<User | null> {
  const { rows } = await q.query<User>(
    `select u.id, u.email, u.timezone
       from auth_tokens t join users u on u.id = t.user_id
      where t.token_hash = $1
        and t.revoked_at is null
        and (t.expires_at is null or t.expires_at > now())`,
    [hashToken(token)],
  );
  return rows[0] ?? null;
}

/**
 * Create a user with the six default areas and the primary companion (Ellis).
 * Seeds structure only; no personal data.
 */
export async function createUser(
  db: Db,
  email: string,
  timezone = "UTC",
): Promise<{ user: User; token: string }> {
  if (!isValidTimeZone(timezone)) throw new Error(`Unknown timezone: ${timezone}`);
  return db.transaction(async (tx) => {
    const { rows } = await tx.query<User>(
      "insert into users (email, timezone) values ($1, $2) returning id, email, timezone",
      [email.trim().toLowerCase(), timezone],
    );
    const user = rows[0]!;
    for (const key of AREA_KEYS) {
      await tx.query("insert into areas (user_id, key, name) values ($1, $2, $3)", [
        user.id,
        key,
        DEFAULT_AREA_NAMES[key],
      ]);
    }
    await tx.query(
      `insert into companions (user_id, name, role, is_primary) values ($1, 'Ellis', 'coach', true)`,
      [user.id],
    );
    const token = await issueToken(tx, user.id, "initial");
    return { user, token };
  });
}
