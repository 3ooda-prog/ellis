// §9 Persistence and authorization.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, insertRecord, testApp, testUser } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof testApp>>;
let a: Awaited<ReturnType<typeof testUser>>;
let b: Awaited<ReturnType<typeof testUser>>;
let aRecord: string;
let aConversation: string;

beforeAll(async () => {
  ctx = await testApp();
  a = await testUser(ctx.db);
  b = await testUser(ctx.db);
  aRecord = await insertRecord(ctx.db, a.user.id, { text: "A's private fact" });
  const chat = await ctx.app.inject({ method: "POST", url: "/v1/chat", headers: auth(a.token), payload: { message: "hi" } });
  aConversation = chat.json().conversation_id;
});
afterAll(async () => {
  await ctx.app.close();
  await ctx.db.close();
});

const PROTECTED = [
  { method: "GET", url: "/v1/me" },
  { method: "DELETE", url: "/v1/me" },
  { method: "GET", url: "/v1/records" },
  { method: "GET", url: "/v1/records/00000000-0000-0000-0000-000000000000" },
  { method: "GET", url: "/v1/conversations" },
  { method: "GET", url: "/v1/conversations/00000000-0000-0000-0000-000000000000/turns" },
  { method: "POST", url: "/v1/chat" },
] as const;

describe("authentication", () => {
  it.each(PROTECTED)("$method $url returns 401 without a token", async (route) => {
    const res = await ctx.app.inject({ method: route.method, url: route.url, payload: route.method === "POST" ? { message: "x" } : undefined });
    expect(res.statusCode).toBe(401);
  });

  it.each(PROTECTED)("$method $url returns 401 with a bad or revoked token", async (route) => {
    const bad = await ctx.app.inject({ method: route.method, url: route.url, headers: auth("ellis_nope") });
    expect(bad.statusCode).toBe(401);
    const c = await testUser(ctx.db);
    await ctx.db.query("update auth_tokens set revoked_at = now() where user_id = $1", [c.user.id]);
    const revoked = await ctx.app.inject({ method: route.method, url: route.url, headers: auth(c.token) });
    expect(revoked.statusCode).toBe(401);
  });

  it("health is public", async () => {
    expect((await ctx.app.inject({ method: "GET", url: "/health" })).statusCode).toBe(200);
  });
});

describe("isolation", () => {
  it("B cannot see A's records in the list", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/v1/records", headers: auth(b.token) });
    expect(res.json().records.map((r: { id: string }) => r.id)).not.toContain(aRecord);
  });

  it("B cannot fetch A's record by id", async () => {
    const res = await ctx.app.inject({ method: "GET", url: `/v1/records/${aRecord}`, headers: auth(b.token) });
    expect(res.statusCode).toBe(404);
    const own = await ctx.app.inject({ method: "GET", url: `/v1/records/${aRecord}`, headers: auth(a.token) });
    expect(own.statusCode).toBe(200);
  });

  it("B cannot list or read A's conversations", async () => {
    const list = await ctx.app.inject({ method: "GET", url: "/v1/conversations", headers: auth(b.token) });
    expect(list.json().conversations).toHaveLength(0);
    const turns = await ctx.app.inject({ method: "GET", url: `/v1/conversations/${aConversation}/turns`, headers: auth(b.token) });
    expect(turns.statusCode).toBe(404);
    const own = await ctx.app.inject({ method: "GET", url: `/v1/conversations/${aConversation}/turns`, headers: auth(a.token) });
    expect(own.statusCode).toBe(200);
    expect(own.json().turns.map((t: { role: string }) => t.role)).toEqual(["user", "assistant"]);
  });

  it("B cannot chat as A's companion", async () => {
    const me = await ctx.app.inject({ method: "GET", url: "/v1/me", headers: auth(a.token) });
    const companionId = me.json().companions[0].id;
    const res = await ctx.app.inject({
      method: "POST", url: "/v1/chat", headers: auth(b.token), payload: { message: "hi", companion_id: companionId },
    });
    expect(res.statusCode).toBe(404);
  });

  it("B's model prompt never contains A's records", async () => {
    ctx.provider.requests.length = 0;
    await ctx.app.inject({ method: "POST", url: "/v1/chat", headers: auth(b.token), payload: { message: "private fact?" } });
    expect(ctx.provider.requests[0]?.system).not.toContain("A's private fact");
  });
});

describe("deleting a user", () => {
  it("cascades to records, turns, conversations, recaps, tokens and audit", async () => {
    const c = await testUser(ctx.db);
    await insertRecord(ctx.db, c.user.id, { text: "to be deleted" });
    await ctx.app.inject({ method: "POST", url: "/v1/chat", headers: auth(c.token), payload: { message: "hello" } });
    await ctx.db.query(
      "insert into recaps (user_id, span, period_start, period_end, text, record_ids) values ($1, 'day', now(), now(), 'x', '{}')",
      [c.user.id],
    );
    const del = await ctx.app.inject({ method: "DELETE", url: "/v1/me", headers: auth(c.token) });
    expect(del.statusCode).toBe(204);

    const counts = await ctx.db.query<Record<string, number>>(
      `select
        (select count(*)::int from records where user_id = $1) as records,
        (select count(*)::int from conversations where user_id = $1) as conversations,
        (select count(*)::int from turns t where not exists (select 1 from conversations c where c.id = t.conversation_id)) as orphan_turns,
        (select count(*)::int from recaps where user_id = $1) as recaps,
        (select count(*)::int from auth_tokens where user_id = $1) as tokens,
        (select count(*)::int from companions where user_id = $1) as companions,
        (select count(*)::int from audit_log where user_id = $1) as audit`,
      [c.user.id],
    );
    expect(counts.rows[0]).toEqual({ records: 0, conversations: 0, orphan_turns: 0, recaps: 0, tokens: 0, companions: 0, audit: 0 });
  });
});

describe("web client", () => {
  it.each(["/", "/app.js", "/app.css", "/voice.js", "/creatures/index.js", "/creatures/sleek.js", "/creatures/spirit.js", "/creatures/toy.js"])("%s is served publicly with a strict CSP", async (url) => {
    const res = await ctx.app.inject({ method: "GET", url });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-security-policy"]).toContain("script-src 'self'");
  });
});
