import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeGithub, makeVault, openVault, uniqueRepo } from "./helpers";
import { WrongPassphraseError } from "@/lib/types";
import { SyncApi } from "@/lib/sync/api";

let gh: FakeGithub;
beforeEach(() => { gh = new FakeGithub(); gh.install(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("FRD 7.1 notes appear from the repo", () => {
  it("loads the tree and blobs, and shows the list from IndexedDB on reopen without network", async () => {
    for (let i = 0; i < 60; i++) gh.set(`n/note${i}.md`, `# ${i}`);
    gh.set(".obsidian/app.json", "{}");
    const repo = uniqueRepo();
    const { v } = await openVault(gh, repo);
    expect(v.listPaths()).toHaveLength(60);
    expect(await v.read("n/note7.md")).toBe("# 7");
    await v.close();
    vi.stubGlobal("fetch", async () => { throw new TypeError("offline"); });
    const v2 = makeVault();
    await v2.open(repo);
    await v2.pullNow();
    expect(v2.listPaths()).toHaveLength(60);
    expect(v2.syncState().kind).toBe("offline");
  });
});

describe("FRD 7.2 / 4 Safe: edits survive a reload", () => {
  it("write persists to IndexedDB before it resolves", async () => {
    gh.set("a.md", "one");
    const { v, repo } = await openVault(gh);
    await v.write("a.md", "two");
    await v.create("b.md", "new #tag [[a]]");
    // simulate crash: do not push, reopen a second vault on the same DB
    const v2 = makeVault();
    vi.stubGlobal("fetch", async () => { throw new TypeError("offline"); });
    await v2.open(repo);
    await v2.pullNow();
    expect(await v2.read("a.md")).toBe("two");
    expect(await v2.read("b.md")).toBe("new #tag [[a]]");
    expect(v2.syncState()).toEqual({ kind: "offline" });
    expect(v2.hasUnsavedChanges()).toBe(true);
  });
});

describe("FRD 7.4 five edited notes make one commit", () => {
  it("batches all dirty notes in a single commit with baseSha", async () => {
    for (let i = 0; i < 8; i++) gh.set(`n${i}.md`, `v${i}`);
    const { v } = await openVault(gh);
    const base = gh.head;
    for (let i = 0; i < 5; i++) await v.write(`n${i}.md`, `edited ${i}`);
    expect(v.syncState()).toEqual({ kind: "unsynced", count: 5 });
    await v.pushNow();
    expect(gh.commits).toHaveLength(1);
    expect(gh.commits[0].baseSha).toBe(base);
    expect(gh.commits[0].changes.map((c) => c.path).sort()).toEqual(["n0.md", "n1.md", "n2.md", "n3.md", "n4.md"]);
    expect(gh.commits[0].message).toBe("Update 5 notes");
    expect(gh.text("n3.md")).toBe("edited 3");
    expect(v.syncState()).toEqual({ kind: "synced" });
    expect(v.hasUnsavedChanges()).toBe(false);
    await v.pushNow();
    expect(gh.commits).toHaveLength(1);
  });
  it("names a single-note commit", async () => {
    gh.set("solo.md", "x");
    const { v } = await openVault(gh);
    await v.write("solo.md", "y");
    await v.pushNow();
    expect(gh.commits[0].message).toBe("Update solo");
  });
});

describe("FRD 7.3 rename updates links, commit contains only affected files", () => {
  it("rewrites inbound links and moves the file", async () => {
    gh.set("Target.md", "# T");
    gh.set("linker.md", "see [[Target]] here\n");
    gh.set("other.md", "nothing\n");
    gh.set("deep/also.md", "[[Target|alias]]\n");
    const { v } = await openVault(gh);
    const { updatedPaths } = await v.rename("Target.md", "Renamed.md");
    expect(updatedPaths.sort()).toEqual(["deep/also.md", "linker.md"]);
    await v.pushNow();
    expect(gh.commits).toHaveLength(1);
    expect(gh.commits[0].changes.map((c) => c.path).sort()).toEqual(["Renamed.md", "Target.md", "deep/also.md", "linker.md"]);
    expect(gh.text("linker.md")).toBe("see [[Renamed]] here\n");
    expect(gh.text("other.md")).toBe("nothing\n");
    expect(gh.files.has("Target.md")).toBe(false);
    expect(gh.text("Renamed.md")).toBe("# T");
  });
});

describe("FRD 7.5 remote changes merge in; clashes keep both versions", () => {
  it("takes a remote change for a clean note and merges non-overlapping edits", async () => {
    gh.set("clean.md", "a\n");
    gh.set("both.md", "line1\nline2\nline3\nline4\nline5\n");
    const { v } = await openVault(gh);
    await v.write("both.md", "LINE1\nline2\nline3\nline4\nline5\n");
    gh.set("clean.md", "a changed on github\n");
    gh.set("both.md", "line1\nline2\nline3\nline4\nLINE5\n");
    await v.pullNow();
    expect(await v.read("clean.md")).toBe("a changed on github\n");
    expect(await v.read("both.md")).toBe("LINE1\nline2\nline3\nline4\nLINE5\n");
    expect(v.conflicts()).toHaveLength(0);
    expect(v.syncState()).toEqual({ kind: "unsynced", count: 1 });
    await v.pushNow();
    expect(gh.text("both.md")).toBe("LINE1\nline2\nline3\nline4\nLINE5\n");
  });

  it("records a Conflict with mine/theirs/base, blocks pushing it, and resolves", async () => {
    gh.set("c.md", "start\n");
    const { v } = await openVault(gh);
    await v.write("c.md", "mine\n");
    gh.set("c.md", "theirs\n");
    await v.pullNow();
    const [c] = v.conflicts();
    expect(c).toMatchObject({ path: "c.md", mine: "mine\n", theirs: "theirs\n", base: "start\n" });
    expect(await v.read("c.md")).toBe("mine\n");
    expect(v.syncState()).toEqual({ kind: "conflict", count: 1 });
    await v.pushNow();
    expect(gh.commits).toHaveLength(0);
    expect(gh.text("c.md")).toBe("theirs\n");
    await v.resolveConflict("c.md", "merged text\n");
    expect(v.conflicts()).toHaveLength(0);
    await v.pushNow();
    expect(gh.text("c.md")).toBe("merged text\n");
  });

  it("handles remote deletes and keeps a dirty local copy", async () => {
    gh.set("gone.md", "x");
    gh.set("keep.md", "y");
    const { v } = await openVault(gh);
    await v.write("keep.md", "y2");
    gh.files.delete("gone.md"); gh.files.delete("keep.md"); gh.head = "c99";
    await v.pullNow();
    expect(v.listPaths()).toEqual(["keep.md"]);
    await v.pushNow();
    expect(gh.text("keep.md")).toBe("y2");
  });
});

describe("FRD 7.6 encryption", () => {
  it("encrypted push contains no plaintext; reopening requires the passphrase", async () => {
    gh.set("s.md", "top secret plaintext");
    const { v, repo } = await openVault(gh);
    await v.enableEncryption("hunter2");
    await v.pushNow();
    expect(gh.commits).toHaveLength(1);
    const paths = gh.commits[0].changes.map((c) => c.path).sort();
    expect(paths).toEqual([".jotter/config.json", "s.md"]);
    for (const c of gh.commits[0].changes) {
      if (c.path === ".jotter/config.json") continue;
      const text = Buffer.from(c.contentBase64!, "base64").toString();
      expect(text.startsWith("JOTTER-ENC1\n")).toBe(true);
      expect(text).not.toContain("secret");
    }
    expect(JSON.parse(gh.text(".jotter/config.json")!).encryption.kdf).toBe("PBKDF2-SHA256");
    await v.close();

    const v2 = makeVault();
    const r = await v2.open(repo);
    await v2.pullNow();
    expect(r).toEqual({ needsPassphrase: true, encrypted: true });
    expect(v2.listPaths()).toEqual([]);
    await expect(v2.unlock("wrong")).rejects.toBeInstanceOf(WrongPassphraseError);
    await v2.unlock("hunter2");
    await v2.pullNow();
    expect(await v2.read("s.md")).toBe("top secret plaintext");
    await v2.write("s.md", "second secret");
    await v2.pushNow();
    expect(gh.text("s.md")).not.toContain("second");
  }, 60_000);

  it("a fresh device unlocks an already-encrypted repo", async () => {
    gh.set("s.md", "x");
    const { v } = await openVault(gh);
    await v.enableEncryption("pw");
    await v.pushNow();
    const v2 = makeVault();
    expect((await v2.open(uniqueRepo())).needsPassphrase).toBe(true);
    await v2.unlock("pw");
    await v2.pullNow();
    expect(await v2.read("s.md")).toBe("x");
  }, 60_000);

  it("disableEncryption rewrites plaintext and config", async () => {
    gh.set("s.md", "plain again");
    const { v } = await openVault(gh);
    await v.enableEncryption("pw");
    await v.pushNow();
    await v.disableEncryption();
    await v.pushNow();
    expect(gh.text("s.md")).toBe("plain again");
    expect(JSON.parse(gh.text(".jotter/config.json")!).encryption).toBeNull();
  }, 60_000);
});

describe("FRD 4 Safe: stale pushes", () => {
  it("on 409 pulls, merges and retries once", async () => {
    gh.set("a.md", "a1\n");
    gh.set("b.md", "b1\n");
    const { v } = await openVault(gh);
    await v.write("a.md", "a2\n");
    let injected = false;
    gh.beforeCommit = () => { if (!injected) { injected = true; gh.set("b.md", "b-remote\n"); } };
    await v.pushNow();
    expect(gh.commits).toHaveLength(1);
    expect(gh.text("a.md")).toBe("a2\n");
    expect(await v.read("b.md")).toBe("b-remote\n");
    expect(v.syncState()).toEqual({ kind: "synced" });
  });
});

describe("FRD 4 Safe: network handling", () => {
  it("retries 5xx with backoff and reports offline on network failure", async () => {
    gh.set("a.md", "x");
    const v = makeVault();
    gh.fail = { status: 503, times: 2 };
    await v.open(uniqueRepo());
    await v.pullNow();
    expect(v.listPaths()).toEqual(["a.md"]);
    const api = new SyncApi({ sleep: async () => {} });
    vi.stubGlobal("fetch", async () => { throw new TypeError("x"); });
    await expect(api.head()).rejects.toMatchObject({ code: "offline" });
  });
});
