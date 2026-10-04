import { describe, it, expect } from "vitest";
import { validatePath, validateRepoRef, validateCommitRequest, MAX_CHANGES } from "@/lib/server/validate";

const sha = "a".repeat(40);
const ok = (over = {}) => ({ baseSha: sha, message: "m", changes: [{ path: "a.md", contentBase64: "aGk=" }], ...over });

describe("validatePath", () => {
  it.each(["../x", "a/../b", "/abs", "a//b", "a/./b", "a\\b", ".git/config", "a/.GIT/x", "", "a\u0000b"])("rejects %j", (p) => {
    expect(() => validatePath(p)).toThrow();
  });
  it("accepts normal paths", () => { expect(validatePath("notes/日本語 file.md")).toBe("notes/日本語 file.md"); });
});

describe("validateRepoRef", () => {
  it("accepts and rejects", () => {
    expect(validateRepoRef({ owner: "o", name: "r.x", branch: "feat/a" })).toEqual({ owner: "o", name: "r.x", branch: "feat/a" });
    expect(() => validateRepoRef({ owner: "o/x", name: "r", branch: "main" })).toThrow();
    expect(() => validateRepoRef({ owner: "o", name: "r", branch: "a..b" })).toThrow();
    expect(() => validateRepoRef(null)).toThrow();
  });
});

describe("validateCommitRequest", () => {
  it("accepts valid, including deletes", () => {
    expect(validateCommitRequest(ok({ changes: [{ path: "a.md", contentBase64: null }] }))).toBeTruthy();
    expect(validateCommitRequest(ok())).toBeTruthy();
  });
  it("rejects bad input", () => {
    expect(() => validateCommitRequest(ok({ baseSha: "zz" }))).toThrow();
    expect(() => validateCommitRequest(ok({ message: " " }))).toThrow();
    expect(() => validateCommitRequest(ok({ changes: [] }))).toThrow();
    expect(() => validateCommitRequest(ok({ changes: [{ path: "../a", contentBase64: null }] }))).toThrow();
    expect(() => validateCommitRequest(ok({ changes: [{ path: "a", contentBase64: "!!!" }] }))).toThrow();
    expect(() => validateCommitRequest(ok({ changes: [{ path: "a", contentBase64: null }, { path: "a", contentBase64: null }] }))).toThrow();
  });
  it("enforces count and size limits", () => {
    const many = Array.from({ length: MAX_CHANGES + 1 }, (_, i) => ({ path: `f${i}`, contentBase64: null }));
    expect(() => validateCommitRequest(ok({ changes: many }))).toThrow(/Too many/);
    const big = "A".repeat(Math.ceil((25 * 1024 * 1024 + 4) / 3) * 4);
    expect(() => validateCommitRequest(ok({ changes: [{ path: "b", contentBase64: big }] }))).toThrow(/25MB/);
  });
});
