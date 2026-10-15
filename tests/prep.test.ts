import { describe, expect, it } from "vitest";
import { CONFIG, SOURCES } from "@/config/sources";
import { itemId, normalizeUrl, prep, type Candidate } from "@/lib/prep";
import type { Seen } from "@/lib/pipeline";
import { isWebUrl } from "@/lib/format";

const now = new Date("2026-10-13T00:00:00Z");
const ago = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();
const noSeen = new Map<string, Seen>();

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

  it("PRD-collector: same URL from two sources dedupes first-wins, but a copy outside its window does not block the other", () => {
    const url = "https://openai.com/index/x";
    const a = mk({ url, sourceId: "openai", section: "newsroom", publishedAt: ago(1) });
    const b = mk({ url, sourceId: "openai-research", section: "playbook", publishedAt: ago(1) });
    expect(run([a, b]).map((i) => i.sourceId)).toEqual(["openai"]);
    const old = ago(100); // outside openai's 72h, inside openai-research's 168h
    expect(run([{ ...a, publishedAt: old }, { ...b, publishedAt: old }]).map((i) => i.sourceId)).toEqual(["openai-research"]);
  });

  it("PLAN-review1: drops items with missing or invalid publishedAt", () => {
    const out = run([mk({ publishedAt: undefined }), mk({ publishedAt: "garbage" }), mk()]);
    expect(out).toHaveLength(1);
  });

  it("PRD-collector: drops items older than 72h, keeps 71h", () => {
    const keep = mk({ publishedAt: ago(71) });
    expect(run([mk({ publishedAt: ago(73) }), keep]).map((i) => i.id)).toEqual([keep.id]);
  });

  it("PRD-collector: a repo's creation date never gates selection", () => {
    const old = repo(50_000, 0, { publishedAt: ago(24 * 900), metrics: { stars: 50_000, starsGained: 4000, period: "week" } });
    expect(run([old]).map((i) => i.id)).toEqual([old.id]);
  });

  it("PRD-collector: repos rank by starsGained (falling back to starsPerDay for legacy metrics)", () => {
    const a = repo(0, 0, { metrics: { stars: 1, starsGained: 500 } });
    const b = repo(0, 0, { metrics: { stars: 1, starsGained: 900 } });
    const legacy = repo(0, 0, { metrics: { stars: 1, starsPerDay: 700 } });
    expect(run([a, legacy, b]).map((i) => i.id)).toEqual([b.id, legacy.id, a.id]);
  });

  it("PRD-collector: Reddit uses the default 72h window (no windowHours override); slow playbook feeds keep 168h", () => {
    const reddit = SOURCES.find((s) => s.id === "reddit")!;
    expect(reddit.windowHours).toBeUndefined();
    const keep = mk({ sourceId: reddit.id, publishedAt: ago(70) });
    const drop = mk({ sourceId: reddit.id, publishedAt: ago(100) });
    expect(run([keep, drop]).map((i) => i.id)).toEqual([keep.id]);
    const slow = SOURCES.find((s) => s.id === "latentspace")!;
    const kept = mk({ sourceId: slow.id, section: "playbook", publishedAt: ago(100) });
    expect(run([kept]).map((i) => i.id)).toEqual([kept.id]);
  });

  it("PRD-collector: drops ids already in an earlier edition", () => {
    const old = mk();
    const fresh = mk();
    expect(run([old, fresh], new Map([[old.id, { ago: 1 }]])).map((i) => i.id)).toEqual([fresh.id]);
  });
});

describe("prep: returning repos", () => {
  const seenWith = (r: Candidate, stars: number | undefined, ago = 1) => new Map<string, Seen>([[r.id, { stars, ago }]]);

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

  it("PRD-collector: seen repo without recorded stars cannot return by growth", () => {
    const r = repo(5000, 30);
    expect(run([r], seenWith(r, undefined))).toEqual([]);
  });

  it("PRD-collector: repo seen within repoDedupeEditions is skipped", () => {
    const r = repo(1100, 30);
    expect(run([r], seenWith(r, 1000, CONFIG.repoDedupeEditions))).toEqual([]);
    expect(run([r], seenWith(r, 1000, 2))).toEqual([]);
  });

  it("daily editions: repos remain excluded through the seventh previous edition", () => {
    const r = repo(1100, 30);
    for (const ago of [5, 6, 7]) expect(run([r], seenWith(r, 1000, ago))).toEqual([]);
  });

  it("daily editions: HF models remain excluded through the seventh previous edition", () => {
    const m = mk({ section: "repos", source: "Hugging Face", metrics: { likes: 500, downloads: 9000 } });
    for (const ago of [5, 6, 7]) expect(run([m], seenWith(m, undefined, ago))).toEqual([]);
  });

  it("PRD-collector: growth rule still applies within the short window", () => {
    const r = repo(1500, 30);
    const [out] = run([r], seenWith(r, 1000, 2));
    expect(out.returning).toBe(true);
    expect(out.metrics?.starsDelta).toBe(500);
  });

  it("PRD-collector: repo seen 8 editions ago is re-listed as returning with starsDelta", () => {
    const r = repo(1100, 30);
    const [out] = run([r], seenWith(r, 1000, 8));
    expect(out.returning).toBe(true);
    expect(out.metrics?.starsDelta).toBe(100);
  });

  it("PRD-collector: old repo without known stars is re-listed as returning without starsDelta", () => {
    const r = repo(1100, 30);
    const [out] = run([r], seenWith(r, undefined, 8));
    expect(out.returning).toBe(true);
    expect(out.metrics?.starsDelta).toBeUndefined();
  });

  it("PRD-collector: Hugging Face model seen 8 editions ago returns without starsDelta", () => {
    const m = mk({ section: "repos", source: "Hugging Face", publishedAt: ago(24 * 5), metrics: { likes: 500, downloads: 9000 } });
    const [out] = run([m], seenWith(m, undefined, 8));
    expect(out.returning).toBe(true);
    expect(out.metrics?.starsDelta).toBeUndefined();
    expect(run([m], seenWith(m, undefined, 3))).toEqual([]);
  });

  it("PRD-collector: non-repo seen 6 editions ago is still skipped", () => {
    const p = mk({ section: "pulse" });
    expect(run([p], seenWith(p, undefined, 6))).toEqual([]);
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

  it("Hugging Face models are slotted into the repo ranking, not dumped behind it", () => {
    const hf = (likes: number) => mk({ section: "repos", source: "Hugging Face", sourceId: "hf-models", metrics: { likes, downloads: 1 } });
    const gh = Array.from({ length: 6 }, (_, i) => repo(100, 60 - i * 10));
    const out = run([hf(5), hf(4), ...gh]).filter((i) => i.section === "repos");
    expect(out.map((i) => i.metrics?.likes ?? i.metrics?.starsPerDay)).toEqual([60, 50, 40, 5, 30, 20, 10, 4]);
  });

  it("PRD-collector: cap is applied after the seen filter, so seen items do not eat the quota", () => {
    const tc = SOURCES.find((s) => s.id === "techcrunch")!;
    const items = Array.from({ length: tc.cap + 3 }, () => mk({ sourceId: tc.id }));
    const seen = new Map<string, Seen>(items.slice(0, 3).map((i) => [i.id, { ago: 1 }]));
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

describe("per-source host allowlist", () => {
  it("SEC: anthropic mirror items outside anthropic.com are dropped", () => {
    const mk2 = (url: string) => mk({ url, sourceId: "anthropic-news" });
    const out = run([mk2("https://www.anthropic.com/news/a"), mk2("https://anthropic.com/news/b"), mk2("https://evil.example/x"), mk2("https://anthropic.com.evil.example/y"), mk2("https://sub.anthropic.com/z")]);
    expect(out.map((i) => i.url).sort()).toEqual(["https://anthropic.com/news/b", "https://www.anthropic.com/news/a"]);
  });
  it("sources without hosts are unrestricted", () => expect(run([mk({ url: "https://evil.example/x", sourceId: "techcrunch" })])).toHaveLength(1));
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
