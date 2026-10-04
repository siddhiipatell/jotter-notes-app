import { describe, it, expect, beforeAll } from "vitest";
import { sealSession, unsealSession } from "@/lib/server/session";

const sess = { token: "gho_secret123", user: { login: "a", name: null, avatarUrl: "u" }, repo: { owner: "a", name: "n", branch: "main" } };

describe("session", () => {
  beforeAll(() => { process.env.SESSION_SECRET = "x".repeat(40); });
  it("round-trips and does not expose the token in the sealed string", async () => {
    const jwe = await sealSession(sess);
    expect(jwe).not.toContain("gho_secret123");
    expect(jwe.split(".")).toHaveLength(5);
    expect(await unsealSession(jwe)).toEqual(sess);
  });
  it("rejects tampering, wrong secret and empty input", async () => {
    const jwe = await sealSession(sess);
    expect(await unsealSession(jwe.slice(0, -2) + "AA")).toBeNull();
    expect(await unsealSession(undefined)).toBeNull();
    process.env.SESSION_SECRET = "y".repeat(40);
    expect(await unsealSession(jwe)).toBeNull();
    process.env.SESSION_SECRET = "x".repeat(40);
  });
});
