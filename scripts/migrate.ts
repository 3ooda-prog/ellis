import { loadConfig } from "../src/config.js";
import { createPgDb } from "../src/db/index.js";
import { migrate } from "../src/db/migrate.js";

const db = createPgDb(loadConfig().databaseUrl);
const applied = await migrate(db);
console.log(applied.length ? `applied: ${applied.join(", ")}` : "up to date");
await db.close();
