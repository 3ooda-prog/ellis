// §9 Retrieval.
import { describe, expect, it } from "vitest";
import { retrieve } from "../src/retrieval/score.js";
import { live } from "./helpers.js";

const now = new Date("2026-10-13T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

describe("retrieve", () => {
  it("a 60-day-old record matching two keywords outranks a 1-day-old unrelated one", () => {
    const old = live({ text: "the Oak Street house roof needs waterproofing", created_at: daysAgo(60) });
    const fresh = live({ text: "Enjoys long walks", created_at: daysAgo(1) });
    const top = retrieve([fresh, old], { message: "What about the roof at the the Oak Street house?", now, homeAreaKey: null }, 1);
    expect(top[0]?.id).toBe(old.id);
  });

  it("an event due tomorrow always appears, even when the window is full", () => {
    const filler = Array.from({ length: 40 }, (_, i) =>
      live({ kind: "task", text: `Unrelated chore number ${i}`, created_at: daysAgo(0) }),
    );
    const dentist = live({
      kind: "event",
      text: "Dentist appointment",
      due_at: new Date(now.getTime() + 86_400_000),
      created_at: daysAgo(30),
    });
    const top = retrieve([...filler, dentist], { message: "hello", now, homeAreaKey: null });
    expect(top.map((r) => r.id)).toContain(dentist.id);
  });

  it("never returns superseded or deleted records", () => {
    const gone = [
      live({ text: "Lives in Sharjah", status: "superseded" as never }),
      live({ text: "Sharjah flat", status: "deleted" as never }),
    ];
    const top = retrieve(gone, { message: "Sharjah", now, homeAreaKey: null });
    expect(top).toHaveLength(0);
  });

  it("caps at 28 records", () => {
    const many = Array.from({ length: 100 }, (_, i) => live({ text: `fact ${i}` }));
    expect(retrieve(many, { message: "", now, homeAreaKey: null })).toHaveLength(28);
  });
});
