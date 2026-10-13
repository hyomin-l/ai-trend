import { describe, expect, it } from "vitest";
import { find, near, prepare, type SearchRow } from "@/lib/search";

const row = (id: string, d: string, t: string, m = "", src = "HN"): SearchRow => ({
  d,
  i: 1,
  s: "repos",
  id,
  t: { ko: t, en: t },
  m: { ko: m, en: m },
  src,
  u: "https://x.test/",
});

// newest first, as in search-index.json
const ps = prepare([
  row("a", "2026-10-14", "ClaudeCode ships hooks"),
  row("b", "2026-10-13", "바이브 코딩 입문", "에이전트와 함께"),
  row("c", "2026-10-12", "Model Context Protocol servers", "Claude Code plugins overview"),
  row("d", "2026-10-11", "Ｒｅｓｅａｒｃｈ agents", "full-width title"),
  row("e", "2026-10-10", "Weekly digest", "mentions claude", "Claude Code Blog"),
]);
const ids = (q: string) => find(ps, q).map((r) => r.id);

describe("near", () => {
  it("allows one edit, including an adjacent swap", () => {
    expect(near("agent", "agnet")).toBe(true);
    expect(near("agent", "agen")).toBe(true);
    expect(near("agent", "agentt")).toBe(true);
    expect(near("agent", "agint")).toBe(true);
    expect(near("agent", "angnt")).toBe(false);
  });
});

describe("find", () => {
  it("is case-insensitive and folds full-width letters", () => {
    expect(ids("CLAUDECODE")).toContain("a");
    expect(ids("research")).toEqual(["d"]);
  });
  it("ignores spaces and hyphens", () => {
    expect(ids("claude code")).toEqual(expect.arrayContaining(["a", "c", "e"]));
    expect(ids("claude-code")).toEqual(expect.arrayContaining(["a", "c"]));
    expect(ids("바이브코딩")).toEqual(["b"]);
    expect(ids("바이브 코딩")).toEqual(["b"]);
  });
  it("requires every token, each anywhere", () => {
    expect(ids("protocol plugins")).toEqual(["c"]);
    expect(ids("protocol nonsense")).toEqual([]);
  });
  it("tolerates one typo in long tokens", () => {
    expect(ids("angets")).toEqual([]); // two edits from "agents"
    expect(ids("agnets")).toEqual(["d"]);
    expect(ids("protocl")).toEqual(["c"]);
    expect(ids("바이브코당")).toEqual(["b"]);
    expect(ids("에이젼트")).toEqual(["b"]);
  });
  it("leaves short Latin tokens exact", () => {
    expect(ids("cod")).toEqual(expect.arrayContaining(["a"])); // substring, not fuzzy
    expect(ids("hxs")).toEqual([]);
  });
  it("ranks title over summary over source, exact over typo, then newest", () => {
    // a: title; c: summary; e: source (+summary has "claude")
    expect(ids("claudecode")[0]).toBe("a");
    expect(ids("claude")).toEqual(["a", "c", "e"]);
    const fuzzy = prepare([row("x", "2026-10-14", "Protocl notes"), row("y", "2026-10-01", "Protocol notes")]);
    expect(find(fuzzy, "protocol").map((r) => r.id)).toEqual(["y", "x"]);
  });
});
