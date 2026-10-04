import { describe, expect, it } from "vitest";
import { fuzzyMatch, fuzzyFilter, parseOperators, extractChips, matchesChips, chipsToString } from "@/lib/ui/fuzzy";

describe("fuzzyMatch", () => {
  it("matches subsequences and rejects non-matches", () => {
    expect(fuzzyMatch("gtn", "Go to note")).not.toBeNull();
    expect(fuzzyMatch("xyz", "Go to note")).toBeNull();
  });
  it("ranks prefix and contiguous matches higher", () => {
    const items = ["Meeting notes", "Notes", "Another note about x"];
    expect(fuzzyFilter(items, "notes", (s) => s)[0]).toBe("Notes");
  });
  it("returns everything for an empty query", () => {
    expect(fuzzyFilter(["a", "b"], "  ", (s) => s)).toEqual(["a", "b"]);
  });
  it("reports matched indices", () => {
    expect(fuzzyMatch("ab", "xaxb")?.indices).toEqual([1, 3]);
  });
});

describe("operator chips", () => {
  it("parses tag: and path: operators out of free text", () => {
    expect(parseOperators("budget tag:finance path:2026/ q3")).toEqual({
      chips: [{ op: "tag", value: "finance" }, { op: "path", value: "2026/" }],
      text: "budget q3",
    });
  });
  it("ignores empty operator values and strips a leading #", () => {
    expect(parseOperators("tag: hello").chips).toEqual([]);
    expect(parseOperators("tag:#todo").chips).toEqual([{ op: "tag", value: "todo" }]);
  });
  it("only commits completed tokens into chips", () => {
    expect(extractChips("tag:foo")).toEqual({ chips: [], rest: "tag:foo" });
    expect(extractChips("tag:foo bar")).toEqual({ chips: [{ op: "tag", value: "foo" }], rest: "bar" });
    expect(extractChips("path:a tag:b ")).toEqual({ chips: [{ op: "path", value: "a" }, { op: "tag", value: "b" }], rest: "" });
  });
  it("round-trips chips to a string", () => {
    expect(chipsToString([{ op: "tag", value: "x" }, { op: "path", value: "y" }])).toBe("tag:x path:y");
  });
  it("filters by path substring and nested tags", () => {
    expect(matchesChips([{ op: "path", value: "daily" }], "Daily/2026-10-01.md", [])).toBe(true);
    expect(matchesChips([{ op: "path", value: "work" }], "Daily/x.md", [])).toBe(false);
    expect(matchesChips([{ op: "tag", value: "project" }], "a.md", ["project/alpha"])).toBe(true);
    expect(matchesChips([{ op: "tag", value: "proj" }], "a.md", ["project"])).toBe(false);
  });
});
