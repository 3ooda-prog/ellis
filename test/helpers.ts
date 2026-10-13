import type { Db } from "../src/db/index.js";
import { migrate } from "../src/db/migrate.js";
import { createPgliteDb } from "../src/db/pglite.js";
import type { LiveRecord } from "../src/extraction/plan.js";
import { createStubProvider, type StubProvider } from "../src/provider/stub.js";
import { buildApp } from "../src/server.js";
import { createUser } from "../src/users.js";

export async function testDb(): Promise<Db> {
  const db = await createPgliteDb();
  await migrate(db);
  return db;
}

let n = 0;
export async function testUser(db: Db, timezone = "UTC") {
  return createUser(db, `user${++n}-${Date.now()}@example.test`, timezone);
}

export async function insertRecord(
  db: Db,
  userId: string,
  r: { kind?: string; text: string; status?: string; due_at?: Date | null; area?: string; created_at?: Date },
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into records (user_id, kind, text, status, due_at, area_id, created_at)
     values ($1, $2, $3, $4, $5, (select id from areas where user_id = $1 and key = $6), $7)
     returning id`,
    [userId, r.kind ?? "fact", r.text, r.status ?? "active", r.due_at ?? null, r.area ?? null, r.created_at ?? new Date()],
  );
  return rows[0]!.id;
}

export function live(partial: Partial<LiveRecord> & { text: string }): LiveRecord {
  return {
    id: partial.id ?? crypto.randomUUID(),
    kind: "fact",
    status: "active",
    version: 1,
    area_key: null,
    due_at: null,
    created_at: new Date(),
    ...partial,
  };
}

export async function testApp(opts: { provider?: StubProvider; clock?: () => Date } = {}) {
  const db = await testDb();
  const provider = opts.provider ?? createStubProvider();
  const app = buildApp({ db, provider, clock: opts.clock, logLevel: "silent" });
  await app.ready();
  return { db, app, provider };
}

export const auth = (token: string) => ({ authorization: `Bearer ${token}` });

export function parseSse(body: string): { event: string; data: any }[] {
  return body
    .split("\n\n")
    .filter((b) => b.trim())
    .map((block) => {
      const event = /^event: (.*)$/m.exec(block)?.[1] ?? "";
      const data = JSON.parse(/^data: (.*)$/m.exec(block)?.[1] ?? "null");
      return { event, data };
    });
}
