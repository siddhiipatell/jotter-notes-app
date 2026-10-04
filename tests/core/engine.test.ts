import { describe, expect, it } from "vitest";
import { IndexEngine } from "../../lib/core/engine";
import { createIndexClient } from "../../lib/core/workerClient";

const files = [
  { path: "A.md", content: "# A\nlinks to [[B]] #x" },
  { path: "B.md", content: "---\naliases: [Bee]\n---\nback to [[A]] and [[Bee]]" },
  { path: "dir/C.md", content: "[[a]] [[missing]] ![[pic.png]]" },
];

describe("IndexEngine", () => {
  it("indexes files and serves parsed, backlinks, search, tags and resolve", () => {
    const e = new IndexEngine();
    e.setAll(files, ["img/pic.png"]);
    expect(e.parsed("A.md")!.tags).toEqual(["x"]);
    expect(e.backlinks("A.md").map((b) => b.fromPath).sort()).toEqual(["B.md", "dir/C.md"]);
    expect(e.search("links")[0].path).toBe("A.md");
    expect(e.allTags()).toEqual([{ tag: "x", count: 1 }]);
    expect(e.resolve("pic.png", "dir/C.md")).toBe("img/pic.png");
    expect(e.resolve("bee", "A.md")).toBe("B.md");
    expect(e.unresolved().map(([t]) => t)).toEqual(["missing"]);
  });
  it("keeps backlinks, search and parsed consistent through upsert, rename and remove", () => {
    const e = new IndexEngine();
    e.setAll(files);
    e.upsert("A.md", "now links to [[dir/C]]");
    expect(e.backlinks("B.md").map((b) => b.fromPath)).toEqual([]);
    expect(e.backlinks("dir/C.md").map((b) => b.fromPath)).toEqual(["A.md"]);
    e.rename("A.md", "Z.md");
    expect(e.parsed("A.md")).toBeUndefined();
    expect(e.parsed("Z.md")!.title).toBe("Z");
    expect(e.search("links")[0].path).toBe("Z.md");
    e.remove("Z.md");
    expect(e.search("links")).toEqual([]);
    expect(e.backlinks("dir/C.md")).toEqual([]);
  });
});

describe("createIndexClient (in-thread fallback)", () => {
  it("falls back to the in-thread engine when Worker is unavailable and fills the sync cache", async () => {
    const c = createIndexClient();
    expect(c.usesWorker).toBe(false);
    let updates = 0;
    const off = c.onUpdate(() => updates++);
    await c.setAll(files);
    expect(c.cache.parsed("A.md")!.title).toBe("A");
    expect(c.cache.allParsed()).toHaveLength(3);
    expect((await c.backlinks("A.md")).length).toBe(2);
    expect(c.cache.backlinks("A.md").length).toBe(2);
    expect((await c.search("back")).map((h) => h.path)).toEqual(["B.md"]);
    expect(c.cache.search("back")).toHaveLength(1);
    await c.upsert("A.md", "changed");
    expect(c.cache.backlinks("A.md")).toEqual([]); // stale cache cleared on mutation
    await c.rename("A.md", "A2.md");
    expect(c.cache.parsed("A.md")).toBeUndefined();
    expect(c.cache.parsed("A2.md")).toBeDefined();
    await c.remove("A2.md");
    expect(await c.resolve("b", "x.md")).toBe("B.md");
    expect((await c.quickSwitch("c"))[0].path).toBe("dir/C.md");
    expect(await c.allTags()).toEqual([]);
    expect(updates).toBeGreaterThan(3);
    off();
    c.dispose();
  });
  it("propagates engine errors as rejected promises", async () => {
    const c = createIndexClient();
    await expect((c as unknown as { upsert(p: unknown, c: unknown): Promise<unknown> }).upsert(undefined, undefined)).rejects.toThrow();
  });
});
