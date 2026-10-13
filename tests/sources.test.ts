import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SOURCES } from "@/config/sources";
import { fetchAll } from "@/lib/sources";
import { itemId } from "@/lib/prep";

const now = new Date("2026-10-13T00:00:00Z");

const feed = (n: number, base: string) =>
  `<rss><channel>${Array.from({ length: n }, (_, i) =>
    `<item><title>${base} ${i}</title><link>https://${base}.test/${i}</link><description>d${i}</description><pubDate>Mon, 12 Oct 2026 12:00:00 GMT</pubDate></item>`,
  ).join("")}</channel></rss>`;

const ghJson = {
  items: [
    { full_name: "o/fast", html_url: "https://github.com/o/fast", description: "Fast tool", created_at: "2026-10-03T00:00:00Z", stargazers_count: 1000, forks_count: 120, language: "Rust" },
    { full_name: "o/new", html_url: "https://github.com/o/new", description: null, created_at: "2026-10-12T12:00:00Z", stargazers_count: 300, language: null },
  ],
};
const hnJson = {
  hits: [
    { objectID: "111", title: "Show HN: thing", url: "https://thing.test/", created_at: "2026-10-12T10:00:00Z", points: 250, num_comments: 40 },
    { objectID: "222", title: "Ask HN: what?", url: null, created_at: "2026-10-12T11:00:00Z", points: 120, num_comments: 9 },
  ],
};

type Call = { url: string; init?: RequestInit };
let calls: Call[];
let handler: (url: string) => Response | Promise<Response>;

beforeEach(() => {
  calls = [];
  handler = (url) => {
    if (url.includes("api.github.com")) return Response.json(ghJson);
    if (url.includes("hn.algolia.com")) return Response.json(hnJson);
    return new Response(feed(3, new URL(url).hostname), { status: 200 });
  };
  vi.stubGlobal("fetch", async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return handler(String(url));
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.GITHUB_TOKEN;
});

describe("fetchAll", () => {
  it("PRD-collector: calls every source once with the ai-trend User-Agent and a timeout signal", async () => {
    await fetchAll(now);
    expect(calls).toHaveLength(SOURCES.length);
    for (const c of calls) {
      const headers = new Headers(c.init?.headers);
      expect(headers.get("user-agent")).toBe(`ai-trend/0.1 (+https://github.com/${process.env.GITHUB_REPOSITORY || "hyomin-l/ai-trend"})`);
      expect(c.init?.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("PRD-collector: GitHub query is topic + created:>30d ago + stars:>100, sorted by stars; no token header by default", async () => {
    await fetchAll(now);
    const gh = calls.filter((c) => c.url.includes("api.github.com"));
    expect(gh).toHaveLength(4);
    const u = new URL(gh[0].url);
    expect(u.searchParams.get("q")).toBe("topic:llm created:>2026-09-13 stars:>100");
    expect(u.searchParams.get("sort")).toBe("stars");
    expect(u.searchParams.get("order")).toBe("desc");
    expect(u.searchParams.get("per_page")).toBe("20");
    expect(new Headers(gh[0].init?.headers).has("authorization")).toBe(false);
  });

  it("PRD-collector: GITHUB_TOKEN adds a Bearer Authorization header to GitHub only", async () => {
    process.env.GITHUB_TOKEN = "tok";
    await fetchAll(now);
    for (const c of calls) {
      const auth = new Headers(c.init?.headers).get("authorization");
      expect(auth).toBe(c.url.includes("api.github.com") ? "Bearer tok" : null);
    }
  });

  it("PRD-collector: maps repos to title=full_name, ★ metrics and starsPerDay = round(stars / max(1, days))", async () => {
    const { items } = await fetchAll(now);
    const fast = items.find((i) => i.url === "https://github.com/o/fast")!;
    expect(fast).toMatchObject({
      id: itemId("https://github.com/o/fast"), source: "GitHub", section: "repos", title: "o/fast",
      snippet: "Fast tool", publishedAt: "2026-10-03T00:00:00.000Z",
      metrics: { stars: 1000, forks: 120, language: "Rust", starsPerDay: 100 }, // 10 days old
    });
    const fresh = items.find((i) => i.url === "https://github.com/o/new")!;
    expect(fresh.metrics?.starsPerDay).toBe(300); // younger than a day => divisor 1
    expect(fresh.snippet).toBe("");
    expect(fresh.metrics?.language).toBeUndefined();
    expect(fresh.metrics?.forks).toBeUndefined(); // no forks_count in the API row => absent, not 0
  });

  it("PRD-collector: HN query encodes numericFilters (points>80, created_at_i > now-72h) and maps hits", async () => {
    const { items } = await fetchAll(now);
    const hn = calls.find((c) => c.url.includes("hn.algolia.com"))!;
    const u = new URL(hn.url);
    expect(u.searchParams.get("tags")).toBe("story");
    expect(u.searchParams.get("query")).toBe("AI");
    expect(u.searchParams.get("numericFilters")).toBe(`points>80,created_at_i>${now.getTime() / 1000 - 72 * 3600}`);
    expect(u.searchParams.get("hitsPerPage")).toBe("30");
    expect(hn.url).toContain("numericFilters=points%3E80%2Ccreated_at_i%3E");
    const hits = items.filter((i) => i.source === "Hacker News");
    expect(hits[0]).toMatchObject({
      section: "pulse", title: "Show HN: thing", url: "https://thing.test/", snippet: "250 points · 40 comments",
      publishedAt: "2026-10-12T10:00:00.000Z", metrics: { points: 250, comments: 40 },
    });
    expect(hits[1].url).toBe("https://news.ycombinator.com/item?id=222");
  });

  it("PRD-collector: RSS items carry source name, section and the industry of the SourceDef", async () => {
    const { items } = await fetchAll(now);
    const def = SOURCES.find((s) => s.id === "gnews-finance-ko")!;
    const fin = items.filter((i) => i.industry === "finance");
    expect(fin.length).toBeGreaterThan(0);
    expect(fin.every((i) => i.source === def.name && i.section === "ax")).toBe(true);
    expect(items.find((i) => i.source === "TechCrunch")).toMatchObject({ section: "newsroom", publishedAt: "2026-10-12T12:00:00.000Z" });
  });

  it("PRD-collector: a source that throws is listed in failed and the rest still arrive", async () => {
    const base = handler;
    handler = (url) => {
      if (url.includes("simonwillison.net")) throw new Error("network down");
      if (url.includes("theverge.com")) return new Response("nope", { status: 503 });
      return base(url);
    };
    const { items, failed } = await fetchAll(now);
    expect(failed.sort()).toEqual(["simonw", "verge"]);
    expect(items.some((i) => i.source === "TechCrunch")).toBe(true);
    expect(items.some((i) => i.source === "Simon Willison")).toBe(false);
  });

  it("PRD-collector: a non-empty response that parses to zero items is a failed source", async () => {
    const base = handler;
    handler = (url) => (url.includes("aitimes.com") ? new Response("<html>blocked by captcha</html>") : base(url));
    expect((await fetchAll(now)).failed).toEqual(["aitimes"]);
  });
});
