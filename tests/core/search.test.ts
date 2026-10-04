import { describe, expect, it } from "vitest";
import { SearchIndex } from "../../lib/core/search";

function make() {
  const s = new SearchIndex();
  s.upsert("Recipes/Pancakes.md", "# Pancakes\nMix flour and eggs.\nCook the batter slowly #food/breakfast");
  s.upsert("Work/Meeting notes.md", "---\ntags: [work]\n---\nDiscuss the quarterly roadmap and budget.\nAction: send flour budget.");
  s.upsert("Journal/2024-01-01.md", "Today I went running. #journal #food");
  return s;
}

describe("SearchIndex.search", () => {
  it("finds notes by body text and returns the matched line as snippet with its line number", () => {
    const hits = make().search("batter");
    expect(hits[0].path).toBe("Recipes/Pancakes.md");
    expect(hits[0].snippet).toContain("Cook the batter");
    expect(hits[0].line).toBe(3);
  });
  it("boosts title matches above body matches", () => {
    const s = make();
    s.upsert("Other.md", "pancakes pancakes pancakes mentioned in body");
    expect(s.search("pancakes")[0].path).toBe("Recipes/Pancakes.md");
  });
  it("supports prefix and fuzzy matching", () => {
    const s = make();
    expect(s.search("roadm")[0].path).toBe("Work/Meeting notes.md");
    expect(s.search("quarterley")[0].path).toBe("Work/Meeting notes.md");
  });
  it("tag: operator filters by tag including nested children and frontmatter tags", () => {
    const s = make();
    expect(s.search("tag:food").map((h) => h.path).sort()).toEqual(["Journal/2024-01-01.md", "Recipes/Pancakes.md"]);
    expect(s.search("tag:#food/breakfast").map((h) => h.path)).toEqual(["Recipes/Pancakes.md"]);
    expect(s.search("tag:work").map((h) => h.path)).toEqual(["Work/Meeting notes.md"]);
    expect(s.search("flour tag:work").map((h) => h.path)).toEqual(["Work/Meeting notes.md"]);
  });
  it("path: operator filters by path substring", () => {
    const s = make();
    expect(s.search("flour path:recipes").map((h) => h.path)).toEqual(["Recipes/Pancakes.md"]);
    expect(s.search('path:"meeting notes"').map((h) => h.path)).toEqual(["Work/Meeting notes.md"]);
  });
  it("quoted phrases must appear contiguously", () => {
    const s = make();
    expect(s.search('"flour and eggs"').map((h) => h.path)).toEqual(["Recipes/Pancakes.md"]);
    expect(s.search('"eggs and flour"')).toEqual([]);
  });
  it("upsert replaces, remove deletes and rename moves the entry", () => {
    const s = make();
    s.upsert("Recipes/Pancakes.md", "now about waffles");
    expect(s.search("batter")).toEqual([]);
    expect(s.search("waffles")).toHaveLength(1);
    s.rename("Recipes/Pancakes.md", "Recipes/Waffles.md");
    expect(s.search("waffles")[0].path).toBe("Recipes/Waffles.md");
    s.remove("Recipes/Waffles.md");
    expect(s.search("waffles")).toEqual([]);
  });
  it("empty and operator-only-no-match queries return empty", () => {
    expect(make().search("")).toEqual([]);
    expect(make().search("tag:nonexistent")).toEqual([]);
  });
  it("does not index frontmatter text as body", () => {
    expect(make().search("quarterly")[0].snippet).toContain("quarterly roadmap");
  });
  it("respects limit", () => {
    const s = new SearchIndex();
    for (let i = 0; i < 10; i++) s.upsert(`n${i}.md`, "common word");
    expect(s.search("common", 3)).toHaveLength(3);
  });
});

describe("SearchIndex.quickSwitch", () => {
  const s = new SearchIndex();
  for (const p of ["Projects/Alpha Plan.md", "Archive/alpha.md", "Daily/2024-01-01.md", "Meeting notes.md", "Notes/Mental models.md"]) s.upsert(p, "");
  it("ranks exact/prefix filename matches first", () => {
    expect(s.quickSwitch("alpha")[0].path).toBe("Archive/alpha.md");
  });
  it("matches subsequences across the name and path", () => {
    expect(s.quickSwitch("mtn").map((r) => r.path)).toContain("Meeting notes.md");
    expect(s.quickSwitch("projalp")[0].path).toBe("Projects/Alpha Plan.md");
  });
  it("returns nothing for non-subsequences and lists all for an empty query within the limit", () => {
    expect(s.quickSwitch("zzz")).toEqual([]);
    expect(s.quickSwitch("", 3)).toHaveLength(3);
  });
});

describe("SearchIndex.allTags", () => {
  it("counts notes per tag, sorted by count, lowercase, nested kept distinct", () => {
    expect(make().allTags()).toEqual([
      { tag: "food", count: 1 },
      { tag: "food/breakfast", count: 1 },
      { tag: "journal", count: 1 },
      { tag: "work", count: 1 },
    ].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)).map((x) => x.tag === "food" ? { tag: "food", count: 1 } : x));
  });
});

describe("performance", () => {
  it("searches 5,000 synthetic notes in under 200ms", () => {
    const words = Array.from({ length: 2000 }, (_, i) => "word" + ((i * 7919) % 2000).toString(36) + "x");
    const s = new SearchIndex();
    let seed = 1;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    for (let i = 0; i < 5000; i++) {
      const body = Array.from({ length: 60 }, () => words[Math.floor(rnd() * words.length)]).join(" ");
      s.upsert(`folder${i % 50}/note ${i}.md`, `# note ${i}\n${body}\n#tag${i % 20}`);
    }
    s.search("warmup"); 
    const queries = ["word1x", "word2 word3", "tag:tag3 word5", "nonexistentterm", "wrd10x"];
    for (const q of queries) {
      const t0 = performance.now();
      s.search(q);
      const dt = performance.now() - t0;
      expect(dt, `query "${q}" took ${dt}ms`).toBeLessThan(200);
    }
    const t0 = performance.now();
    s.quickSwitch("note 42");
    expect(performance.now() - t0).toBeLessThan(200);
  });
});
