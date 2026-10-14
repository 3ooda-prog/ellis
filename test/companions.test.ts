// Saving the companion's name and look.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE, normalizeAppearance, OPTIONS } from "../public/creature.js";
import { auth, testApp, testUser } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof testApp>>;
let a: Awaited<ReturnType<typeof testUser>>;
let b: Awaited<ReturnType<typeof testUser>>;
let companionId: string;

beforeAll(async () => {
  ctx = await testApp();
  a = await testUser(ctx.db);
  b = await testUser(ctx.db);
  companionId = (await ctx.app.inject({ method: "GET", url: "/v1/me", headers: auth(a.token) })).json().companions[0].id;
});
afterAll(async () => {
  await ctx.app.close();
  await ctx.db.close();
});

const look = { species: "foxling", color: "mint", pattern: "spots", eyes: "sparkle", accessory: "scarf" };
const patch = (token: string, payload: unknown, id = companionId) =>
  ctx.app.inject({ method: "PATCH", url: `/v1/companions/${id}`, headers: auth(token), payload: payload as object });

describe("PATCH /v1/companions/:id", () => {
  it("saves name and appearance, and /me returns them", async () => {
    const res = await patch(a.token, { name: "Pip", appearance: look });
    expect(res.statusCode).toBe(200);
    const me = (await ctx.app.inject({ method: "GET", url: "/v1/me", headers: auth(a.token) })).json();
    expect(me.companions[0]).toMatchObject({ name: "Pip", appearance: look });
  });

  it("the new name reaches the model's instructions", async () => {
    await patch(a.token, { name: "Pip" });
    await ctx.app.inject({ method: "POST", url: "/v1/chat", headers: auth(a.token), payload: { message: "hi" } });
    expect(ctx.provider.requests.at(-1)!.system).toMatch(/^You are Pip,/);
  });

  it("rejects unknown options, missing keys and empty or long names", async () => {
    expect((await patch(a.token, { appearance: { ...look, accessory: "crown" } })).statusCode).toBe(400);
    expect((await patch(a.token, { appearance: { species: "mochi" } })).statusCode).toBe(400);
    expect((await patch(a.token, { appearance: { ...look, extra: "x" } })).statusCode).toBe(400);
    expect((await patch(a.token, { name: "   " })).statusCode).toBe(400);
    expect((await patch(a.token, { name: "x".repeat(25) })).statusCode).toBe(400);
    expect((await patch(a.token, {})).statusCode).toBe(400);
  });

  it("another user cannot change it", async () => {
    expect((await patch(b.token, { name: "Hacked" })).statusCode).toBe(404);
    const me = (await ctx.app.inject({ method: "GET", url: "/v1/me", headers: auth(a.token) })).json();
    expect(me.companions[0].name).not.toBe("Hacked");
  });

  it("requires a token", async () => {
    const res = await ctx.app.inject({ method: "PATCH", url: `/v1/companions/${companionId}`, payload: { name: "x" } });
    expect(res.statusCode).toBe(401);
  });
});

describe("creature options", () => {
  it("normalizes unknown or missing values to defaults", () => {
    expect(normalizeAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(normalizeAppearance({ species: "dragon", color: "sky" })).toEqual({ ...DEFAULT_APPEARANCE, color: "sky" });
  });
  it("every default is an allowed option", () => {
    for (const [k, v] of Object.entries(DEFAULT_APPEARANCE)) expect((OPTIONS as Record<string, string[]>)[k]).toContain(v);
  });
});
