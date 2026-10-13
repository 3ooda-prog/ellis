// §9 Extraction validation: hand-written model output, no model calls.
import { describe, expect, it } from "vitest";
import { MAX_TEXT, planExtraction } from "../src/extraction/plan.js";
import { live } from "./helpers.js";

const ctx = (records = [] as ReturnType<typeof live>[]) => ({ live: records, timezone: "UTC" });
const item = (o: Record<string, unknown>) => ({
  kind: "fact", text: "x", when: "", area: "", certain: true, sensitive: false, replaces: "", ...o,
});
function plan(raw: unknown, records?: ReturnType<typeof live>[]) {
  const r = planExtraction(raw, ctx(records));
  if (!r.ok) throw new Error(r.error);
  return r.plan;
}

describe("planExtraction", () => {
  it("stores an unknown kind as fact", () => {
    const p = plan({ remember: [item({ kind: "wish", text: "Wants a boat" })] });
    expect(p.creates[0]).toMatchObject({ kind: "fact", text: "Wants a boat" });
  });

  it("stores an event with no date as a task", () => {
    const p = plan({ remember: [item({ kind: "event", text: "Dentist", when: "" })] });
    expect(p.creates[0]?.kind).toBe("task");
    const p2 = plan({ remember: [item({ kind: "event", text: "Dentist", when: "sometime soon" })] });
    expect(p2.creates[0]?.kind).toBe("task");
  });

  it("keeps a dated event and gives a date with no time 09:00 local", () => {
    const r = planExtraction(
      { remember: [item({ kind: "event", text: "Dentist", when: "2026-10-20" })] },
      { live: [], timezone: "Asia/Dubai" },
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.plan.creates[0]?.kind).toBe("event");
    expect(r.plan.creates[0]?.dueAt?.toISOString()).toBe("2026-10-20T05:00:00.000Z"); // 09:00 at UTC+4
  });

  it("marks uncertain items candidate + inferred", () => {
    const p = plan({ remember: [item({ text: "Probably prefers mornings", certain: false })] });
    expect(p.creates[0]).toMatchObject({ status: "candidate", confidence: "inferred" });
  });

  it("drops empty or whitespace text", () => {
    const p = plan({ remember: [item({ text: "   " }), item({ text: "" })] });
    expect(p.creates).toHaveLength(0);
    expect(p.notes.join(" ")).toMatch(/empty text/);
  });

  it("drops a case-insensitive duplicate of a live record and within the batch", () => {
    const p = plan(
      { remember: [item({ text: "has two kids" }), item({ text: "Likes tea" }), item({ text: "likes  TEA" })] },
      [live({ text: "Has two kids" })],
    );
    expect(p.creates.map((c) => c.text)).toEqual(["Likes tea"]);
  });

  it("clamps a 10 000-character text instead of dropping it, and says so", () => {
    const p = plan({ remember: [item({ text: "a".repeat(10_000) })] });
    expect(p.creates[0]?.text.length).toBe(MAX_TEXT);
    expect(p.notes.join(" ")).toMatch(/clamped/);
  });

  it("resolves replaces by id, then by substring", () => {
    const old = live({ text: "Lives in Sharjah" });
    const byId = plan({ remember: [item({ text: "Lives in Dubai", replaces: old.id })] }, [old]);
    expect(byId.creates[0]?.supersedes?.id).toBe(old.id);
    const bySub = plan({ remember: [item({ text: "Lives in Dubai", replaces: "in sharjah" })] }, [old]);
    expect(bySub.creates[0]?.supersedes?.id).toBe(old.id);
  });

  it("matches done against live tasks only, by id or words", () => {
    const task = live({ kind: "task", text: "Chase Sam for payment" });
    const fact = live({ text: "Sam is a client" });
    const p = plan({ done: ["sam for payment"] }, [fact, task]);
    expect(p.complete.map((r) => r.id)).toEqual([task.id]);
    expect(plan({ done: [fact.id] }, [fact, task]).complete).toHaveLength(0);
  });

  it("forget targets a live record; too-short phrases match nothing", () => {
    const rec = live({ text: "Works at Acme" });
    expect(plan({ forget: ["acme"] }, [rec]).forget.map((r) => r.id)).toEqual([rec.id]);
    expect(plan({ forget: ["a"] }, [rec]).forget).toHaveLength(0);
  });

  it("maps area keys and display names; unknown areas become null", () => {
    const r = planExtraction(
      { remember: [item({ text: "A", area: "DesignEase" }), item({ text: "B", area: "family" }), item({ text: "C", area: "mars" })] },
      { live: [], timezone: "UTC", areaNames: { designease: "design" } },
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.plan.creates.map((c) => c.areaKey)).toEqual(["design", "family", null]);
  });

  it("rejects malformed payloads as a whole", () => {
    expect(planExtraction("not json", ctx()).ok).toBe(false);
    expect(planExtraction({ remember: "oops" }, ctx()).ok).toBe(false);
    expect(planExtraction([], ctx()).ok).toBe(false);
  });
});
