import { loadConfig } from "./config.js";
import { createPgDb } from "./db/index.js";
import { migrate } from "./db/migrate.js";
import { createAnthropicProvider } from "./provider/anthropic.js";
import { buildApp } from "./server.js";

const config = loadConfig();
const db = createPgDb(config.databaseUrl);
await migrate(db);
const app = buildApp({
  db,
  provider: createAnthropicProvider({ model: config.model, effort: config.effort }),
  logLevel: config.logLevel,
});

const shutdown = async () => {
  await app.close();
  await db.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ port: config.port, host: config.host });
