// §8 step 2 — the conversation slice, end to end through HTTP with a stubbed model.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProviderError } from "../src/provider/types.js";
import { auth, insertRecord, parseSse, testApp, testUser } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof testApp>>;
let u: Awaited<ReturnType<typeof testUser>>;
let now: Date;

beforeEach(async () => {
  now = new Date("2026-10-13T10:00:00Z");
  ctx = await testApp({ clock: () => now });
  u = await testUser(ctx.db, "Asia/Dubai");
});
afterEach(async () => {
  await ctx.app.close();
  await ctx.db.close();
});

const item = (o: Record<string, unknown>) => ({
  kind: "fact", text: "x", when: "", area: "", certain: true, sensitive: false, replaces: "", ...o,
});
const chat = (message: string, headers: Record<string, string> = {}) =>
  ctx.app.inject({ method: "POST", url: "/v1/chat", headers: { ...auth(u.token), ...headers }, payload: { message } });
const records = async (status?: string) =>
  (await ctx.db.query<any>(
    `select r.*, a.key as area_key from records r left join areas a on a.id = r.area_id
      where r.user_id = $1 ${status ? "and r.status = $2" : ""} order by r.created_at, r.text`,
    status ? [u.user.id, status] : [u.user.id],
  )).rows;

describe("conversation slice", () => {
  it("persists both turns, saves extracted records with provenance, and returns receipts", async () => {
    ctx.provider.push({
      text: "Nice, a dentist visit on Monday. I'll keep that in mind.",
      toolInput: {
        remember: [
          item({ kind: "event", text: "Dentist appointment", when: "2026-10-19T15:30", area: "family" }),
          item({ kind: "fact", text: "Might be nervous about dentists", certain: false }),
        ],
        done: [],
        forget: [],
      },
    });
    const res = await chat("I have the dentist Monday at 3:30");
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.reply).toMatch(/dentist/);
    expect(body.receipts.map((r: any) => r.action)).toEqual(["saved", "unconfirmed"]);

    const turns = await ctx.db.query<any>(
      "select role, content from turns where conversation_id = $1 order by created_at",
      [body.conversation_id],
    );
    expect(turns.rows.map((t) => t.role)).toEqual(["user", "assistant"]);

    const saved = await records();
    const companion = (await ctx.db.query<any>("select id from companions where user_id = $1", [u.user.id])).rows[0];
    expect(saved).toHaveLength(2);
    for (const r of saved) {
      expect(r.source_conversation_id).toBe(body.conversation_id);
      expect(r.created_by_companion_id).toBe(companion.id);
    }
    const event = saved.find((r) => r.kind === "event");
    expect(event.due_at.toISOString()).toBe("2026-10-19T11:30:00.000Z"); // 15:30 Dubai
    expect(event.area_key).toBe("family");
    expect(saved.find((r) => r.status === "candidate").confidence).toBe("inferred");

    const auditActions = (await ctx.db.query<any>("select action from audit_log where user_id = $1", [u.user.id])).rows.map((r) => r.action);
    expect(auditActions.filter((a) => a === "record.create")).toHaveLength(2);
  });

  it("puts relevant records, with ids, area names and the user's local time, into the prompt", async () => {
    const id = await insertRecord(ctx.db, u.user.id, { kind: "task", text: "Send Sam the final invoice", area: "design" });
    await ctx.db.query("update areas set name = 'DesignEase' where user_id = $1 and key = 'design'", [u.user.id]);
    await chat("Did I invoice Sam yet?");
    const system = ctx.provider.requests[0]!.system;
    expect(system).toContain(`[${id}] task (design): Send Sam the final invoice`);
    expect(system).toContain('design ("DesignEase")');
    expect(system).toContain("Now: Tuesday 2026-10-13 14:00 (Asia/Dubai)");
    expect(system).toMatch(/^You are Ellis, a small companion character/);
  });

  it("a correction supersedes the old record instead of deleting it", async () => {
    const oldId = await insertRecord(ctx.db, u.user.id, { text: "Lives in Sharjah" });
    ctx.provider.push({
      text: "Got it, Dubai then.",
      toolInput: { remember: [item({ text: "Lives in Dubai", replaces: oldId })], done: [], forget: [] },
    });
    const body = (await chat("Actually I moved to Dubai")).json();
    expect(body.receipts[0]).toMatchObject({ action: "corrected", replaced: { id: oldId } });
    const old = (await ctx.db.query<any>("select * from records where id = $1", [oldId])).rows[0];
    expect(old.status).toBe("superseded");
    expect(old.closed_at).not.toBeNull();
    expect(old.version).toBe(2);
    const fresh = (await records("active"))[0];
    expect(fresh.text).toBe("Lives in Dubai");
    expect(fresh.supersedes_id).toBe(oldId);
  });

  it("done closes a task with closed_at; forget supersedes, never deletes", async () => {
    const task = await insertRecord(ctx.db, u.user.id, { kind: "task", text: "Chase Sam for payment" });
    const fact = await insertRecord(ctx.db, u.user.id, { text: "Works from the Harbour office" });
    ctx.provider.push({
      text: "Great news.",
      toolInput: { remember: [], done: ["Chase Sam"], forget: [fact] },
    });
    const body = (await chat("Sam paid! Also I don't work from Harbour anymore")).json();
    expect(body.receipts.map((r: any) => r.action)).toEqual(["completed", "forgotten"]);
    const rows = await ctx.db.query<any>("select id, status, closed_at from records where id in ($1, $2)", [task, fact]);
    const byId = Object.fromEntries(rows.rows.map((r) => [r.id, r]));
    expect(byId[task]).toMatchObject({ status: "done" });
    expect(byId[task].closed_at).not.toBeNull();
    expect(byId[fact]).toMatchObject({ status: "superseded" });
  });

  it("malformed extraction: the reply still arrives, nothing is written, an error is logged", async () => {
    ctx.provider.push({ text: "Sure thing.", toolInput: { remember: "not-an-array" } });
    const res = await chat("remember I like tea");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ reply: "Sure thing.", receipts: [] });
    expect(await records()).toHaveLength(0);
    const audit = (await ctx.db.query<any>("select detail from audit_log where action = 'extraction.error'")).rows;
    expect(audit).toHaveLength(1);
    expect(audit[0].detail.error).toMatch(/not an array/);
  });

  it("a truncated tool call is never persisted", async () => {
    ctx.provider.push({ text: "Okay.", toolInputError: "tool input cut off at max_tokens" });
    await chat("lots of things");
    expect(await records()).toHaveLength(0);
    expect((await ctx.db.query("select 1 from audit_log where action = 'extraction.error'")).rowCount).toBe(1);
  });

  it("a refusal saves nothing and still answers", async () => {
    ctx.provider.push({ text: "", stopReason: "refusal", toolInput: { remember: [item({ text: "should not save" })], done: [], forget: [] } });
    const body = (await chat("something declined")).json();
    expect(body.reply).toMatch(/can't help/);
    expect(await records()).toHaveLength(0);
  });

  it("a provider failure keeps the user's turn and reports a retryable error", async () => {
    ctx.provider.push(new ProviderError("rate limited", 429, true));
    const res = await chat("hello?");
    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({ retryable: true });
    const turns = await ctx.db.query<any>("select role from turns");
    expect(turns.rows.map((t) => t.role)).toEqual(["user"]);
  });

  it("starts a new conversation after a 45-minute gap and sends only its turns as context", async () => {
    const first = (await chat("first")).json().conversation_id;
    now = new Date(now.getTime() + 44 * 60_000);
    expect((await chat("second")).json().conversation_id).toBe(first);
    now = new Date(now.getTime() + 46 * 60_000);
    const third = (await chat("third")).json().conversation_id;
    expect(third).not.toBe(first);
    expect(ctx.provider.requests.at(-1)!.messages).toEqual([{ role: "user", content: "third" }]);
    const ended = (await ctx.db.query<any>("select ended_at from conversations where id = $1", [first])).rows[0];
    expect(ended.ended_at).not.toBeNull();
  });

  it("caps model context at the last 12 turns", async () => {
    for (let i = 0; i < 8; i++) {
      now = new Date(now.getTime() + 60_000);
      await chat(`message ${i}`);
    }
    const msgs = ctx.provider.requests.at(-1)!.messages;
    expect(msgs).toHaveLength(12);
    expect(msgs.at(-1)).toEqual({ role: "user", content: "message 7" });
  });

  it("streams deltas, then receipts, then done over SSE", async () => {
    ctx.provider.push({
      text: "Noted, you decided to pause new clients.",
      toolInput: { remember: [item({ kind: "decision", text: "Pause new clients until the Oak Street house is done" })], done: [], forget: [] },
    });
    const res = await chat("I'm pausing new clients until the Oak Street house is done", { accept: "text/event-stream" });
    expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
    const events = parseSse(res.body);
    const types = events.map((e) => e.event);
    expect(types[0]).toBe("start");
    expect(types.slice(-2)).toEqual(["receipts", "done"]);
    const streamed = events.filter((e) => e.event === "delta").map((e) => e.data.text).join("");
    expect(streamed).toBe("Noted, you decided to pause new clients.");
    expect(events.find((e) => e.event === "receipts")!.data.receipts[0].record.kind).toBe("decision");
  });

  it("rejects empty and oversized messages", async () => {
    expect((await chat("   ")).statusCode).toBe(400);
    expect((await chat("x".repeat(8001))).statusCode).toBe(400);
  });
});

describe("concurrency", () => {
  it("a record changed after planning is not overwritten", async () => {
    const { applyPlan } = await import("../src/extraction/apply.js");
    const { loadLive } = await import("../src/records.js");
    const id = await insertRecord(ctx.db, u.user.id, { kind: "task", text: "Pay rent" });
    const [stale] = await loadLive(ctx.db, u.user.id);
    // Another tab marks it done first.
    await ctx.db.query("update records set status = 'done', version = version + 1 where id = $1", [id]);
    const receipts = await ctx.db.transaction((tx) =>
      applyPlan(tx, { creates: [], complete: [stale!], forget: [], notes: [] }, { userId: u.user.id, conversationId: null, companionId: null }),
    );
    expect(receipts).toHaveLength(0);
    const row = (await ctx.db.query<any>("select status, version from records where id = $1", [id])).rows[0];
    expect(row).toEqual({ status: "done", version: 2 });
  });

  it("the database refuses a second live record with the same wording", async () => {
    await insertRecord(ctx.db, u.user.id, { text: "Likes tea" });
    await expect(insertRecord(ctx.db, u.user.id, { text: "LIKES TEA" })).rejects.toThrow();
    await insertRecord(ctx.db, u.user.id, { text: "likes tea", status: "superseded" }); // closed records don't count
  });
});
