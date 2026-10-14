import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
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

const hfJson = [
  { id: "acme/big-model", likes: 2100, downloads: 125000, createdAt: "2026-09-14T14:53:42.000Z", pipeline_tag: "text-generation", library_name: "transformers", trendingScore: 900 },
  { id: "someone/big-model-GGUF", likes: 400, downloads: 90000, createdAt: "2026-10-01T00:00:00.000Z", pipeline_tag: "text-generation" },
  { id: "x/Cool-Image-Uncensored", likes: 300, downloads: 1000, createdAt: "2026-10-01T00:00:00.000Z" },
  { id: "x/tiny-AWQ", likes: 30, downloads: 100, createdAt: "2026-10-01T00:00:00.000Z" },
  { id: "org/no-created", likes: 50, lastModified: "2026-10-10T00:00:00.000Z" },
  { id: "org/third", likes: 10, downloads: 5, createdAt: "2026-10-02T00:00:00.000Z" },
];

const papersJson = JSON.parse(readFileSync("tests/fixtures/hfpapers/daily_papers.json", "utf8")) as any[];

const trendingHtml = `<html><body>
<article class="Box-row"><h2 class="h3"><a href="/acme/agent-kit" class="Link"><span class="text-normal"> acme / </span> agent-kit</a></h2>
<p class="col-9"> An <b>LLM</b> agent toolkit &amp; runtime </p>
<div><span itemprop="programmingLanguage">Python</span><a href="/acme/agent-kit/stargazers" class="x"> 12,345</a><a href="/acme/agent-kit/forks" class="x"> 1,020</a>
<span class="d-inline-block float-sm-right"> 3,210 stars this week </span></div></article>
<article class="Box-row"><h2 class="h3"><a href="/bob/ps5-port" class="Link"><span> bob / </span> ps5-port</a></h2>
<p> Tool for porting executables </p>
<div><span itemprop="programmingLanguage">C++</span><a href="/bob/ps5-port/stargazers"> 35,358</a><a href="/bob/ps5-port/forks"> 3,066</a>
<span> 28,663 stars this week </span></div></article>
</body></html>`;

type Call = { url: string; init?: RequestInit };
let calls: Call[];
let handler: (url: string) => Response | Promise<Response>;

beforeEach(() => {
  calls = [];
  handler = (url) => {
    if (url.startsWith("https://github.com/trending")) return new Response(trendingHtml);
    if (url.includes("api.github.com/repos/")) return Response.json({ created_at: "2025-03-01T00:00:00Z" });
    if (url.includes("api.github.com/search")) return Response.json(ghJson);
    if (url.includes("hn.algolia.com")) return Response.json(hnJson);
    if (url.includes("huggingface.co/api/daily_papers")) return Response.json(papersJson);
    if (url.includes("huggingface.co/api/models")) return Response.json(hfJson);
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
    expect(calls.filter((c) => !c.url.includes("api.github.com/repos/"))).toHaveLength(SOURCES.filter((s) => !s.fallback).length);
    for (const c of calls) {
      const headers = new Headers(c.init?.headers);
      expect(headers.get("user-agent")).toBe(`ai-trend/0.1 (+https://github.com/${process.env.GITHUB_REPOSITORY || "hyomin-l/ai-trend"})`);
      expect(c.init?.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("PRD-collector: trending (weekly, AI-filtered) is the primary repo source; GitHub Search is not called while it works", async () => {
    const { items } = await fetchAll(now);
    const trending = calls.filter((c) => c.url.startsWith("https://github.com/trending"));
    expect(trending.map((c) => c.url)).toEqual([
      "https://github.com/trending?since=weekly",
      "https://github.com/trending/python?since=weekly",
      "https://github.com/trending/typescript?since=weekly",
    ]);
    expect(calls.some((c) => c.url.includes("api.github.com/search"))).toBe(false);
    const repos = items.filter((i) => i.section === "repos" && i.source === "GitHub");
    expect(repos.every((r) => r.url === "https://github.com/acme/agent-kit")).toBe(true); // ps5-port is not AI-related
    expect(repos).toHaveLength(3); // once per trending page
    expect(repos[0]).toMatchObject({
      id: itemId("https://github.com/acme/agent-kit"), source: "GitHub", title: "acme/agent-kit",
      snippet: "An LLM agent toolkit & runtime", publishedAt: "2025-03-01T00:00:00.000Z", // creation date from REST, display only
      metrics: { stars: 12345, forks: 1020, language: "Python", starsGained: 3210, period: "week" },
    });
  });

  it("PRD-collector: failed creation-date lookup keeps the repo, dated now", async () => {
    const base = handler;
    handler = (url) => (url.includes("api.github.com/repos/") ? new Response("rate limited", { status: 403 }) : base(url));
    const { items, failed } = await fetchAll(now);
    expect(failed).toEqual([]);
    expect(items.find((i) => i.section === "repos")?.publishedAt).toBe(now.toISOString());
  });

  it("PRD-collector: GitHub Search runs as fallback only when trending yields too few repos; query is topic + created:>30d ago + stars:>100", async () => {
    const base = handler;
    handler = (url) => (url.startsWith("https://github.com/trending") ? new Response("blocked", { status: 429 }) : base(url));
    const { items, failed } = await fetchAll(now);
    expect(failed).toEqual(["gh-trending", "gh-trending-python", "gh-trending-typescript"]);
    const gh = calls.filter((c) => c.url.includes("api.github.com/search"));
    expect(gh).toHaveLength(4);
    const u = new URL(gh[0].url);
    expect(u.searchParams.get("q")).toBe("topic:llm created:>2026-09-13 stars:>100");
    expect(u.searchParams.get("sort")).toBe("stars");
    expect(u.searchParams.get("order")).toBe("desc");
    expect(u.searchParams.get("per_page")).toBe("20");
    expect(new Headers(gh[0].init?.headers).has("authorization")).toBe(false);
    const fast = items.find((i) => i.url === "https://github.com/o/fast")!;
    expect(fast).toMatchObject({
      id: itemId("https://github.com/o/fast"), title: "o/fast", publishedAt: "2026-10-03T00:00:00.000Z",
      metrics: { stars: 1000, forks: 120, language: "Rust", starsPerDay: 100 }, // 10 days old
    });
    expect(items.find((i) => i.url === "https://github.com/o/new")?.metrics?.starsPerDay).toBe(300); // younger than a day => divisor 1
  });

  it("PRD-collector: GITHUB_TOKEN adds a Bearer Authorization header to GitHub only", async () => {
    process.env.GITHUB_TOKEN = "tok";
    await fetchAll(now);
    for (const c of calls) {
      const auth = new Headers(c.init?.headers).get("authorization");
      expect(auth).toBe(c.url.includes("api.github.com") ? "Bearer tok" : null);
    }
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

  it("PRD-collector: Hugging Face trending models become repos items; re-packaged copies are skipped, likes/downloads are metrics", async () => {
    const { items, failed } = await fetchAll(now);
    expect(failed).toEqual([]);
    const hf = calls.find((c) => c.url.includes("huggingface.co/api/models"))!;
    const u = new URL(hf.url);
    expect(u.searchParams.get("sort")).toBe("trendingScore");
    expect(u.searchParams.get("direction")).toBe("-1");
    expect(u.searchParams.get("limit")).toBe("30");
    const models = items.filter((i) => i.source === "Hugging Face");
    expect(models.map((i) => i.title)).toEqual(["acme/big-model", "org/no-created", "org/third"]);
    expect(models[0]).toMatchObject({
      section: "repos", url: "https://huggingface.co/acme/big-model", id: itemId("https://huggingface.co/acme/big-model"),
      snippet: "text-generation · transformers", publishedAt: "2026-09-14T14:53:42.000Z", metrics: { likes: 2100, downloads: 125000 },
    });
    expect(models[1]).toMatchObject({ publishedAt: "2026-10-10T00:00:00.000Z", metrics: { likes: 50, downloads: 0 } }); // lastModified fallback
  });

  it("PRD-collector: a failing Hugging Face API fails only that source", async () => {
    const base = handler;
    handler = (url) => (url.includes("huggingface.co/api/models") ? new Response("down", { status: 500 }) : base(url));
    const { items, failed } = await fetchAll(now);
    expect(failed).toEqual(["hf-models"]);
    expect(items.some((i) => i.source === "GitHub")).toBe(true);
  });

  it("PRD-collector: Hugging Face Daily Papers become playbook items ranked by upvotes, capped, below the threshold dropped", async () => {
    const { items, failed } = await fetchAll(now);
    expect(failed).toEqual([]);
    const def = SOURCES.find((s) => s.id === "hf-papers")!;
    const papers = items.filter((i) => i.source === "Hugging Face Papers");
    expect(papers).toHaveLength(def.cap);
    const ups = papers.map((p) => p.metrics!.upvotes!);
    expect(ups).toEqual([...ups].sort((a, b) => b - a));
    expect(ups.every((n) => n >= def.minUpvotes!)).toBe(true);
    const top = papersJson.slice().sort((a, b) => b.paper.upvotes - a.paper.upvotes)[0];
    expect(papers[0]).toMatchObject({
      section: "playbook", title: top.paper.title, url: `https://huggingface.co/papers/${top.paper.id}`,
      id: itemId(`https://huggingface.co/papers/${top.paper.id}`), publishedAt: top.paper.submittedOnDailyAt, metrics: { upvotes: top.paper.upvotes },
    });
    expect(papers[0].snippet).not.toMatch(/\s{2}|\n/);
    expect(new URL(calls.find((c) => c.url.includes("daily_papers"))!.url).searchParams.get("limit")).toBe("50");
  });

  it("PRD-collector: a failing Daily Papers API fails only that source", async () => {
    const base = handler;
    handler = (url) => (url.includes("daily_papers") ? new Response("down", { status: 500 }) : base(url));
    const { items, failed } = await fetchAll(now);
    expect(failed).toEqual(["hf-papers"]);
    expect(items.some((i) => i.source === "Hugging Face")).toBe(true);
  });

  it("PRD-collector: official announcement feeds are newsroom sources", async () => {
    const { items } = await fetchAll(now);
    for (const name of ["OpenAI", "Google AI", "Google DeepMind", "Anthropic"]) {
      expect(items.find((i) => i.source === name)).toMatchObject({ section: "newsroom" });
    }
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
