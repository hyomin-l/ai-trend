import { CONFIG, SOURCES } from "@/config/sources";
import { itemId, type Candidate } from "@/lib/prep";
import { parseFeed } from "@/lib/rss";
import type { SourceDef } from "@/types";

const UA = "ai-trend/0.1 (+https://github.com/hyomin-l/ai-trend)";
const DAY = 86_400_000;

async function get(url: string, headers: Record<string, string> = {}): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA, ...headers }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function fetchSource(s: SourceDef, now: Date): Promise<Candidate[]> {
  const base = { source: s.name, section: s.section, sourceId: s.id };

  if (s.kind === "github") {
    const since = new Date(now.getTime() - CONFIG.repoWindowDays * DAY).toISOString().slice(0, 10);
    const q = encodeURIComponent(`topic:${s.url} created:>${since} stars:>100`);
    const token = process.env.GITHUB_TOKEN;
    const body = await get(
      `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=20`,
      { Accept: "application/vnd.github+json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    );
    return (JSON.parse(body).items as any[]).map((r) => ({
      ...base,
      id: itemId(r.html_url),
      title: r.full_name,
      url: r.html_url,
      snippet: r.description ?? "",
      publishedAt: new Date(r.created_at).toISOString(),
      metrics: {
        stars: r.stargazers_count,
        language: r.language ?? undefined,
        starsPerDay: Math.round(r.stargazers_count / Math.max(1, (now.getTime() - Date.parse(r.created_at)) / DAY)),
      },
    }));
  }

  if (s.kind === "hn") {
    const since = Math.floor(now.getTime() / 1000 - CONFIG.windowHours * 3600);
    const filters = encodeURIComponent(`points>80,created_at_i>${since}`);
    const body = await get(
      `https://hn.algolia.com/api/v1/search?tags=story&query=${encodeURIComponent(s.url)}&numericFilters=${filters}&hitsPerPage=30`,
    );
    return (JSON.parse(body).hits as any[]).map((h) => {
      const url = h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`;
      return {
        ...base,
        id: itemId(url),
        title: h.title,
        url,
        snippet: `${h.points} points · ${h.num_comments ?? 0} comments`,
        publishedAt: new Date(h.created_at).toISOString(),
        metrics: { points: h.points, comments: h.num_comments ?? 0 },
      };
    });
  }

  const xml = await get(s.url);
  const feed = parseFeed(xml);
  if (xml.trim() && !feed.length) throw new Error("response parsed to 0 items");
  return feed.map((f) => {
    // Google News titles end with " - Publisher"; surface the real outlet as the source.
    const m = s.name === "Google News" ? f.title.match(/^(.*\S)\s+-\s+([^-]+)$/) : null;
    return { ...base, ...f, ...(m && { title: m[1], source: m[2].trim() }), publishedAt: f.publishedAt ?? (s.undated ? now.toISOString() : undefined), id: itemId(f.url), industry: s.industry };
  });
}

/** Every source in parallel; a failing source is reported in `failed` and never aborts the rest. */
export async function fetchAll(now: Date): Promise<{ items: Candidate[]; failed: string[] }> {
  const results = await Promise.allSettled(SOURCES.map((s) => fetchSource(s, now)));
  const items: Candidate[] = [];
  const failed: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") return void items.push(...r.value);
    failed.push(SOURCES[i].id);
    console.error(`[sources] ${SOURCES[i].id} failed: ${r.reason?.message ?? r.reason}`);
  });
  return { items, failed };
}
