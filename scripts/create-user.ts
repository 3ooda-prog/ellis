// Usage: npm run user:create -- <email> [timezone]
// Prints a bearer token once. Store it; only its hash is kept.
import { loadConfig } from "../src/config.js";
import { createPgDb } from "../src/db/index.js";
import { migrate } from "../src/db/migrate.js";
import { createUser } from "../src/users.js";

const [email, timezone = "UTC"] = process.argv.slice(2);
if (!email) {
  console.error("usage: npm run user:create -- <email> [timezone]");
  process.exit(1);
}
const db = createPgDb(loadConfig().databaseUrl);
await migrate(db);
const { user, token } = await createUser(db, email, timezone);
console.log(`user ${user.id} (${user.email}, ${user.timezone})`);
console.log(`token ${token}`);
await db.close();
