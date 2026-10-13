// In-process Postgres (WASM) for tests and zero-setup local runs.
// Same SQL dialect as production; no server to install.
import { PGlite } from "@electric-sql/pglite";
import type { Db, Queryable } from "./index.js";

type PGliteLike = Pick<PGlite, "query">;

function wrap(c: PGliteLike): Queryable {
  return {
    async query<T>(sql: string, params?: unknown[]) {
      const r = await c.query<T>(sql, params as unknown[] | undefined);
      // affectedRows is 0 for SELECT; pg's rowCount counts returned rows there.
      return { rows: r.rows, rowCount: Math.max(r.rows.length, r.affectedRows ?? 0) };
    },
  };
}

export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const pg = await PGlite.create(dataDir);
  return {
    ...wrap(pg),
    async exec(sql) {
      await pg.exec(sql);
    },
    transaction: (fn) => pg.transaction((tx) => fn(wrap(tx))),
    close: () => pg.close(),
  };
}
