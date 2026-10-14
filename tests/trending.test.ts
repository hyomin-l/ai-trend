import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { AI_REPO_KEYWORDS } from "@/config/sources";
import { parseCount, parseTrending } from "@/lib/trending";

describe("parseTrending", () => {
  it("skips articles without a weekly gain and returns [] for unrelated HTML", () => {
    expect(parseTrending("<html>nothing</html>")).toEqual([]);
    expect(parseTrending('<article><h2><a href="/a/b">x</a></h2><p>d</p></article>')).toEqual([]);
  });
});

const fx = (n: string) => parseTrending(fs.readFileSync(`tests/fixtures/trending/${n}-weekly.html`, "utf8"));

describe("parseTrending on real pages", () => {
  it("all languages: exact values shown on the page", () => {
    const r = fx("all");
    expect(r).toHaveLength(4);
    expect(r[0]).toEqual({
      fullName: "boykopovar/AnyPS5", description: "Tool for automatic PS5 executables porting to Linux and Windows",
      language: "C++", stars: 35366, forks: 3067, starsGained: 28663,
    });
    expect(r[1]).toMatchObject({ fullName: "mattpocock/skills", starsGained: 11955 });
  });
  it("typescript: full name kept, every metric sane", () => {
    const r = fx("typescript");
    expect(r.map((x) => x.fullName)).toContain("morluto/rea");
    expect(r.find((x) => x.fullName === "morluto/rea")!.starsGained).toBe(183758);
  });
  it.each(["all", "python", "typescript"])("%s: no garbage numbers", (n) => {
    const r = fx(n);
    expect(r.length).toBeGreaterThan(0);
    for (const x of r) for (const v of [x.stars, x.forks, x.starsGained]) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(10_000_000);
    }
  });
  it("drops invalid fields instead of publishing them", () => {
    const art = (stars: string) => `<article><h2><a href="/a/b">x</a></h2><a href="/a/b/stargazers"><svg><path d="M8 .25 1 2"></path></svg> ${stars}</a> 5 stars this week</article>`;
    expect(parseTrending(art("1,234"))[0].stars).toBe(1234);
    expect(parseTrending(art("1.2k"))[0].stars).toBe(1200);
    expect(parseTrending(art("99,999,999,999"))[0].stars).toBeUndefined();
  });
});

describe("parseCount", () => {
  it.each([["1,234", 1234], ["12", 12], ["1.2k", 1200], ["3K", 3000], ["0", 0]])("%s", (s, n) => expect(parseCount(s)).toBe(n));
  it.each(["", "abc", "1,2,3", "1e300", "10,000,000", "5 6", "8 .25 1"])("rejects %j", (s) => expect(parseCount(s)).toBeUndefined());
});

describe("AI_REPO_KEYWORDS", () => {
  it.each(["An LLM agent runtime", "MCP server for Postgres", "RAG pipeline", "Skills for agents", "Claude Code plugins", "Stable diffusion UI"])(
    "matches %s", (t) => expect(AI_REPO_KEYWORDS.test(t)).toBe(true));
  it.each(["Tool for porting PS5 executables", "A fast Rust web framework", "Paint app", "Maintain docs"])(
    "does not match %s", (t) => expect(AI_REPO_KEYWORDS.test(t)).toBe(false));
});
