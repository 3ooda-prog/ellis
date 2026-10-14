// Customizing the companion, its growth, and evolution.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creatureSvg, DEFAULT_APPEARANCE, FAMILIES, normalizeAppearance } from "../public/creatures/index.js";
import { growthFrom, STAGE_THRESHOLDS } from "../src/growth.js";
import { auth, testApp, testUser } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof testApp>>;
let a: Awaited<ReturnType<typeof testUser>>;
let b: Awaited<ReturnType<typeof testUser>>;
let companionId: string;

beforeAll(async () => {
  ctx = await testApp();
  a = await testUser(ctx.db);
  b = await testUser(ctx.db);
  companionId = (await me(a.token)).companions[0].id;
});
afterAll(async () => {
  await ctx.app.close();
  await ctx.db.close();
});

async function me(token: string) {
  return (await ctx.app.inject({ method: "GET", url: "/v1/me", headers: auth(token) })).json();
}
const look = { family: "spirit", palette: "aurora", accent: "teal" };
const patch = (token: string, payload: unknown, id = companionId) =>
  ctx.app.inject({ method: "PATCH", url: `/v1/companions/${id}`, headers: auth(token), payload: payload as object });
const evolve = (token: string, id = companionId) =>
  ctx.app.inject({ method: "POST", url: `/v1/companions/${id}/evolve`, headers: auth(token) });

/** Give the companion `n` kept memories (2 points each). */
async function addMemories(userId: string, n: number, prefix: string) {
  for (let i = 0; i < n; i++) {
    await ctx.db.query(
      "insert into records (user_id, kind, text, created_by_companion_id) values ($1, 'fact', $2, $3)",
      [userId, `${prefix} ${i}`, companionId],
    );
  }
}

describe("customizing", () => {
  it("saves name and look, and /me returns them", async () => {
    expect((await patch(a.token, { name: "Pip", appearance: look })).statusCode).toBe(200);
    expect((await me(a.token)).companions[0]).toMatchObject({ name: "Pip", appearance: look, stage: 1 });
  });

  it("the new name reaches the model's instructions", async () => {
    await ctx.app.inject({ method: "POST", url: "/v1/chat", headers: auth(a.token), payload: { message: "hi" } });
    expect(ctx.provider.requests.at(-1)!.system).toMatch(/^You are Pip,/);
  });

  it("rejects options from another family, unknown keys, and bad names", async () => {
    const bad = [
      { appearance: { family: "spirit", palette: "slate", accent: "teal" } }, // slate is a sleek palette
      { appearance: { family: "dragon", palette: "moon", accent: "teal" } },
      { appearance: { ...look, accent: "neon" } },
      { appearance: { ...look, extra: "x" } },
      { appearance: { family: "spirit" } },
      { appearance: { family: "toy", palette: "toString", accent: "teal" } }, // inherited property names
      { name: "   " },
      { name: "x".repeat(25) },
      {},
    ];
    for (const payload of bad) expect((await patch(a.token, payload)).statusCode, JSON.stringify(payload)).toBe(400);
  });

  it("another user cannot change it, and a token is required", async () => {
    expect((await patch(b.token, { name: "Hacked" })).statusCode).toBe(404);
    expect((await evolve(b.token)).statusCode).toBe(404);
    const anon = await ctx.app.inject({ method: "PATCH", url: `/v1/companions/${companionId}`, payload: { name: "x" } });
    expect(anon.statusCode).toBe(401);
  });
});

describe("growth and evolution", () => {
  it("counts kept memories, finished tasks, decisions and days talked; not guesses", async () => {
    const before = (await me(a.token)).companions[0].growth.points;
    await ctx.db.query(
      `insert into records (user_id, kind, text, status, confidence, created_by_companion_id) values
        ($1, 'task', 'growth task', 'done', 'explicit', $2),
        ($1, 'decision', 'growth decision', 'active', 'explicit', $2),
        ($1, 'fact', 'growth guess', 'candidate', 'inferred', $2)`,
      [a.user.id, companionId],
    );
    // task: 2 + 3, decision: 2 + 3, guess: 0
    expect((await me(a.token)).companions[0].growth.points).toBe(before + 10);
  });

  it("will not evolve before enough growth", async () => {
    const res = await evolve(a.token);
    expect(res.statusCode).toBe(409);
    expect(res.json().growth.ready).toBe(false);
  });

  it("keep_form holds it in place even when ready", async () => {
    await addMemories(a.user.id, 30, "memory");
    expect((await me(a.token)).companions[0].growth.ready).toBe(true);
    await patch(a.token, { keep_form: true });
    expect((await me(a.token)).companions[0].growth.ready).toBe(false);
    expect((await evolve(a.token)).statusCode).toBe(409);
    await patch(a.token, { keep_form: false });
  });

  it("evolves one stage at a time, keeps the look, and audits it", async () => {
    const res = await evolve(a.token);
    expect(res.statusCode).toBe(200);
    expect(res.json().companion).toMatchObject({ stage: 2, appearance: look, name: "Pip" });
    expect((await evolve(a.token)).statusCode).toBe(409); // not yet at the stage-3 threshold
    const logged = await ctx.db.query("select detail from audit_log where action = 'companion.evolve'");
    expect(logged.rows).toEqual([{ detail: { from: 1, to: 2 } }]);
  });
});

describe("growthFrom", () => {
  it("reports progress and stops at stage 3", () => {
    expect(growthFrom(10, 1, false)).toMatchObject({ next_at: STAGE_THRESHOLDS[2], stage_start: 0, ready: false });
    expect(growthFrom(STAGE_THRESHOLDS[3], 2, false).ready).toBe(true);
    expect(growthFrom(9999, 3, false)).toMatchObject({ next_at: null, ready: false });
  });
});

describe("creature registry", () => {
  it("normalizes unknown values to defaults", () => {
    expect(normalizeAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(normalizeAppearance({ family: "toy", palette: "nope" }).palette).toBe(Object.keys(FAMILIES.toy.palettes)[0]);
  });

  it("every family draws all three stages with every palette", () => {
    for (const [family, fam] of Object.entries(FAMILIES)) {
      expect(fam.stages).toHaveLength(3);
      for (const palette of Object.keys(fam.palettes)) {
        for (const stage of [1, 2, 3]) {
          const svg = creatureSvg({ family, palette, accent: "teal" }, stage);
          expect(svg).toMatch(/^<svg class="creature fam-/);
          expect(svg).not.toMatch(/undefined|NaN/);
        }
      }
    }
  });

  it("never puts the label into markup unescaped", () => {
    expect(creatureSvg(DEFAULT_APPEARANCE, 1, { label: '"><script>x</script>' })).not.toContain("<script>");
  });
});

describe("dev stage control", () => {
  it("is not available unless ELLIS_DEV_TOOLS is on", async () => {
    const res = await ctx.app.inject({
      method: "POST", url: `/v1/dev/companions/${companionId}/stage`, headers: auth(a.token), payload: { stage: 3 },
    });
    expect(res.statusCode).toBe(404);
    expect((await me(a.token)).dev_tools).toBe(false);
  });

  it("when on, sets any stage for your own companion only", async () => {
    const dev = await testApp({ devTools: true });
    const u = await testUser(dev.db);
    const other = await testUser(dev.db);
    const id = (await dev.app.inject({ method: "GET", url: "/v1/me", headers: auth(u.token) })).json().companions[0].id;
    const set = (token: string, stage: unknown) =>
      dev.app.inject({ method: "POST", url: `/v1/dev/companions/${id}/stage`, headers: auth(token), payload: { stage } });
    expect((await set(u.token, 3)).json().companion.stage).toBe(3);
    expect((await set(u.token, 1)).json().companion.stage).toBe(1);
    expect((await set(u.token, 4)).statusCode).toBe(400);
    expect((await set(other.token, 2)).statusCode).toBe(404);
    expect((await dev.app.inject({ method: "GET", url: "/v1/me", headers: auth(u.token) })).json().dev_tools).toBe(true);
    await dev.app.close();
    await dev.db.close();
  });
});
