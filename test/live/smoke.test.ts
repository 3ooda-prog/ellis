// §9 end-to-end smoke test: ONE real model call. Run nightly, not in the fast
// suite:  ANTHROPIC_API_KEY=... npm run test:live
// The recap half of the handover's smoke test lands with §8 step 5.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handleMessage } from "../../src/conversation/service.js";
import type { Db } from "../../src/db/index.js";
import { createAnthropicProvider } from "../../src/provider/anthropic.js";
import { insertRecord, testDb, testUser } from "../helpers.js";

const enabled = !!process.env.ELLIS_LIVE;
let db: Db;

beforeAll(async () => {
  if (enabled) db = await testDb();
});
afterAll(async () => {
  await db?.close();
});

describe.runIf(enabled)("live conversation", () => {
  it("extracts a task and a decision and closes the paid task", async () => {
    const { user } = await testUser(db, "Asia/Dubai");
    const payment = await insertRecord(db, user.id, { kind: "task", text: "Chase Sam for his payment" });
    const provider = createAnthropicProvider({ model: process.env.ELLIS_MODEL ?? "claude-opus-5-5", effort: "low" });
    const log = { info: () => {}, error: (o: object, m?: string) => console.error(m, o) };

    const out = await handleMessage(
      { db, provider, log },
      {
        user,
        message:
          "Sam finally paid, I should send the final invoice, and I decided to hold off on new clients until the Oak Street house is done",
      },
      () => {},
    );
    expect(out.reply).toBeTruthy();

    const rows = (await db.query<any>("select * from records where user_id = $1", [user.id])).rows;
    const created = rows.filter((r) => r.id !== payment);
    expect(created.filter((r) => r.kind === "task")).toHaveLength(1);
    expect(created.filter((r) => r.kind === "decision")).toHaveLength(1);
    for (const r of created) expect(r.source_conversation_id).toBe(out.conversationId);
    expect(rows.find((r) => r.id === payment).status).toBe("done");
  }, 120_000);
});
