import { describe, expect, it } from "vitest";
import { bootstrapFirstUser } from "../src/bootstrap.js";
import { userForToken } from "../src/users.js";
import { testDb } from "./helpers.js";

describe("bootstrapFirstUser", () => {
  it("creates the first user once, with a working token, then does nothing", async () => {
    const db = await testDb();
    expect(await bootstrapFirstUser(db, undefined, undefined)).toBeNull();
    const first = await bootstrapFirstUser(db, "Me@Example.test", "Asia/Dubai");
    expect(first?.email).toBe("me@example.test");
    expect((await userForToken(db, first!.token))?.timezone).toBe("Asia/Dubai");
    expect(await bootstrapFirstUser(db, "other@example.test", "UTC")).toBeNull();
    await db.close();
  });
});
