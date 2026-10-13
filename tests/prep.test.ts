import { describe, expect, it } from "vitest";
import { CONFIG, SOURCES } from "@/config/sources";
import { itemId, normalizeUrl, prep, type Candidate } from "@/lib/prep";
import { isWebUrl } from "@/lib/format";

const now = new Date("2026-10-13T00:00:00Z");
const ago = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();
const noSeen = new Map<string, number | undefined>();

let n = 0;
function mk(over: Partial<Candidate> = {}): Candidate {
  const url = over.url ?? `https://example.com/p${++n}`;
  return {
    id: itemId(url), source: "Src", section: "newsroom", title: `t${n}`, url, snippet: "s",
    publishedAt: ago(1), ...over,
  };
}
const repo = (stars: number, perDay: number, over: Partial<Candidate> = {}) =>
  mk({ section: "repos", source: "GitHub", publishedAt: ago(24 * 5), metrics: { stars, starsPerDay: perDay }, ...over });
const run = (raw: Candidate[], seen = noSeen) => prep(raw, { now, seen });

describe("normalizeUrl / itemId", () => {
  it("PRD-collector: strips utm_*, fbclid, gclid, ref, hash and the trailing slash", () => {
    expect(normalizeUrl("https://Example.com/a/b/?utm_source=x&utm_medium=y&fbclid=1&gclid=2&ref=hn&id=7#top")).toBe(
      "https://example.com/a/b?id=7",
    );
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com");
  });

  it("PRD-collector: utm params produce the same 12-hex id", () => {
    const a = itemId("https://example.com/post?utm_source=newsletter");
    expect(a).toBe(itemId("https://example.com/post/"));
    expect(a).toMatch(/^[0-9a-f]{12}$/);
    expect(a).not.toBe(itemId("https://example.com/other"));
  });
});

describe("prep: filters", () => {
  it("PRD-collector: dedupes items whose URLs differ only by tracking params", () => {
    const a = mk({ url: "https://example.com/x?utm_source=a" });
    const b = mk({ url: "https://example.com/x/?utm_campaign=b" });
    expect(run([a, b])).toHaveLength(1);
  });

  it("PLAN-review1: drops items with missing or invalid publishedAt", () => {
    const out = run([mk({ publishedAt: undefined }), mk({ publishedAt: "garbage" }), mk()]);
    expect(out).toHaveLength(1);
  });

  it("PRD-collector: drops items older than 72h, keeps 71h", () => {
    const keep = mk({ publishedAt: ago(71) });
    expect(run([mk({ publishedAt: ago(73) }), keep]).map((i) => i.id)).toEqual([keep.id]);
  });

  it("PRD-collector: repos use a 30-day window", () => {
    const keep = repo(500, 20, { publishedAt: ago(24 * 29) });
    expect(run([repo(500, 20, { publishedAt: ago(24 * 31) }), keep]).map((i) => i.id)).toEqual([keep.id]);
  });

  it("PRD-collector: a source's own windowHours overrides the 72h default (reddit 168h)", () => {
    const reddit = SOURCES.find((s) => s.id === "reddit")!;
    expect(reddit.windowHours).toBe(168);
    const keep = mk({ sourceId: reddit.id, publishedAt: ago(100) });
    const drop = mk({ sourceId: reddit.id, publishedAt: ago(170) });
    const noOverride = mk({ publishedAt: ago(100) });
    expect(run([keep, drop, noOverride]).map((i) => i.id)).toEqual([keep.id]);
  });

  it("PRD-collector: drops ids already in an earlier edition", () => {
    const old = mk();
    const fresh = mk();
    expect(run([old, fresh], new Map([[old.id, undefined]])).map((i) => i.id)).toEqual([fresh.id]);
  });
});

describe("prep: returning repos", () => {
  const seenWith = (r: Candidate, stars: number) => new Map<string, number | undefined>([[r.id, stars]]);

  it("PRD-collector: repo at exactly 1.5x stars returns with returning=true and starsDelta", () => {
    const r = repo(1500, 30);
    const [out] = run([r], seenWith(r, 1000));
    expect(out.returning).toBe(true);
    expect(out.metrics?.starsDelta).toBe(500);
    expect(out.metrics?.stars).toBe(1500);
  });

  it("PRD-collector: repo at 1.49x stars stays excluded", () => {
    const r = repo(1490, 30);
    expect(run([r], seenWith(r, 1000))).toEqual([]);
  });

  it("PRD-collector: returning exception applies to repos only", () => {
    const p = mk({ section: "pulse", metrics: { stars: 5000 } });
    expect(run([p], seenWith(p, 100))).toEqual([]);
  });

  it("PRD-collector: seen repo without recorded stars cannot return", () => {
    const r = repo(5000, 30);
    expect(run([r], new Map([[r.id, undefined]]))).toEqual([]);
  });
});

describe("prep: ordering and caps", () => {
  it("PRD-collector: repos are ordered by stars-per-day, highest first", () => {
    const slow = repo(900, 10);
    const fast = repo(300, 60);
    const mid = repo(500, 30);
    expect(run([slow, fast, mid]).map((i) => i.metrics?.starsPerDay)).toEqual([60, 30, 10]);
  });

  it("PRD-collector: applies the per-source cap (SourceDef.cap)", () => {
    const tc = SOURCES.find((s) => s.id === "techcrunch")!;
    const items = Array.from({ length: tc.cap + 5 }, () => mk({ sourceId: tc.id }));
    const out = run(items);
    expect(out).toHaveLength(tc.cap);
    expect(out.map((i) => i.id)).toEqual(items.slice(0, tc.cap).map((i) => i.id)); // source order kept
  });

  it("PRD-collector: a repo source's cap keeps its fastest repos, not its first ones", () => {
    const gh = SOURCES.find((s) => s.id === "gh-llm")!;
    const items = Array.from({ length: gh.cap + 2 }, (_, i) => repo(100 + i, i + 1, { sourceId: gh.id })); // speed 1..cap+2, slowest first
    const speeds = run(items).map((i) => i.metrics?.starsPerDay);
    expect(speeds).toEqual(Array.from({ length: gh.cap }, (_, i) => gh.cap + 2 - i));
  });

  it("PRD-collector: cap is applied after the seen filter, so seen items do not eat the quota", () => {
    const tc = SOURCES.find((s) => s.id === "techcrunch")!;
    const items = Array.from({ length: tc.cap + 3 }, () => mk({ sourceId: tc.id }));
    const seen = new Map<string, number | undefined>(items.slice(0, 3).map((i) => [i.id, undefined]));
    expect(run(items, seen)).toHaveLength(tc.cap);
  });

  it("PRD-collector: totalCap keeps every section represented", () => {
    const flood = Array.from({ length: 200 }, () => mk({ section: "newsroom" }));
    const small = (["ax", "pulse", "playbook"] as const).flatMap((section) =>
      Array.from({ length: 3 }, () => mk({ section })),
    );
    const repos = [repo(900, 10), repo(300, 60)];
    const out = run([...flood, ...small, ...repos]);
    expect(out).toHaveLength(CONFIG.totalCap);
    for (const s of ["ax", "pulse", "playbook"] as const) expect(out.filter((i) => i.section === s)).toHaveLength(3);
    expect(out.filter((i) => i.section === "repos")).toHaveLength(2);
    expect(out.filter((i) => i.section === "newsroom")).toHaveLength(CONFIG.totalCap - 11);
  });

  it("PRD-collector: totalCap also mixes sources inside one section", () => {
    const a = Array.from({ length: 100 }, () => mk({ section: "ax", source: "A" }));
    const b = Array.from({ length: 100 }, () => mk({ section: "ax", source: "B" }));
    const out = run([...a, ...b]);
    expect(out).toHaveLength(CONFIG.totalCap);
    expect(out.filter((i) => i.source === "A")).toHaveLength(CONFIG.totalCap / 2);
  });
});

describe("URL scheme gate", () => {
  const bad = ["javascript:alert(1)", "data:text/html,<script>1</script>", "/relative/path", "not a url", "", "ftp://example.com/x"];

  it("SEC: prep drops non-http(s) and malformed URLs, keeps https", () => {
    const good = mk({ url: "https://example.com/ok" });
    const out = run([...bad.map((u) => mk({ url: u })), good, mk({ url: "http://example.com/plain" })]);
    expect(out.map((i) => i.url).sort()).toEqual(["http://example.com/plain", "https://example.com/ok"]);
  });

  it("SEC: isWebUrl accepts only http(s)", () => {
    expect(isWebUrl("https://example.com/a")).toBe(true);
    expect(isWebUrl("  HTTP://example.com ")).toBe(true);
    for (const u of bad) expect(isWebUrl(u)).toBe(false);
    expect(isWebUrl("JaVaScRiPt:alert(1)")).toBe(false);
  });
});
