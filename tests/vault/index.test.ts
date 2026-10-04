import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import { Vault } from "@/lib/vault";
import { SyncApi } from "@/lib/sync/api";
import { FakeGithub, uniqueRepo } from "./helpers";

let gh: FakeGithub;
beforeEach(() => { gh = new FakeGithub(); gh.install(); });
afterEach(() => vi.unstubAllGlobals());

it("FRD 7.2 derived data (backlinks, tags, search) comes from the real index via the mirror", async () => {
  gh.set("A.md", "# A\n#idea links [[B]]\n");
  gh.set("B.md", "# B\nhello world\n");
  const v = new Vault({ auto: false, api: new SyncApi({ sleep: async () => {} }) });
  await v.open(uniqueRepo());
  await v.pullNow();
  await new Promise<void>((resolve) => {
    const off = v.subscribe("index", () => { if (v.backlinks("B.md").length) { off(); resolve(); } });
    v.backlinks("B.md");
  });
  expect(v.backlinks("B.md")[0].fromPath).toBe("A.md");
  await vi.waitFor(() => expect(v.allTags().map((t) => t.tag)).toContain("idea"));
  await vi.waitFor(() => expect(v.search("hello")[0]?.path).toBe("B.md"));
  expect(v.tree().length).toBe(2);
  await v.close();
});
