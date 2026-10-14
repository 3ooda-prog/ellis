// First-run account creation for hosts without a shell (e.g. Railway).
// If ELLIS_BOOTSTRAP_EMAIL is set and no users exist yet, create that user
// and return their token so the caller can print it once to the deploy log.
// Does nothing once any user exists, so leaving the variable set is harmless.
import type { Db } from "./db/index.js";
import { createUser } from "./users.js";

export async function bootstrapFirstUser(
  db: Db,
  email: string | undefined,
  timezone: string | undefined,
): Promise<{ email: string; token: string } | null> {
  if (!email) return null;
  const { rows } = await db.query<{ n: number }>("select count(*)::int as n from users");
  if (rows[0]!.n > 0) return null;
  const { user, token } = await createUser(db, email, timezone || "UTC");
  return { email: user.email, token };
}
