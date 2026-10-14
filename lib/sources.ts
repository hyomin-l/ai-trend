import { AI_REPO_KEYWORDS, CONFIG, HF_SKIP, SOURCES } from "@/config/sources";
import { itemId, type Candidate } from "@/lib/prep";
import { parseFeed } from "@/lib/rss";
import { parseTrending } from "@/lib/trending";
import type { SourceDef } from "@/types";

const UA = `ai-trend/0.1 (+https://github.com/${process.env.GITHUB_REPOSITORY || "hyomin-l/ai-trend"})`;
const DAY = 86_400_000;

async function get(url: string, headers: Record<string, string> = {}): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA, ...headers }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function fetchSource(s: SourceDef, now: Date): Promise<Candidate[]> {
  const base = { source: s.name, section: s.section, sourceId: s.id };

  if (s.kind === "ghtrending") {
    const html = await get(`https://github.com/trending${s.url ? `/${s.url}` : ""}?since=weekly`);
    const repos = parseTrending(html);
    if (html.trim() && !repos.length) throw new Error("trending page parsed to 0 repos");
    const ai = repos.filter((r) => AI_REPO_KEYWORDS.test(`${r.fullName.replace(/[-_/]/g, " ")} ${r.description}`)).slice(0, s.cap);
    // Creation date and (when available) topics come from the REST API; best effort, never gates selection.
    const token = process.env.GITHUB_TOKEN;
    const meta = await Promise.all(
      ai.map((r) =>
        get(`https://api.github.com/repos/${r.fullName}`, { Accept: "application/vnd.github+json", ...(token ? { Authorization: `Bearer ${token}` } : {}) })
          .then((b) => JSON.parse(b) as { created_at?: string })
          .catch(() => ({}) as { created_at?: string }),
      ),
    );
    return ai.map((r, i) => {
      const url = `https://github.com/${r.fullName}`;
      const created = Date.parse(meta[i].created_at ?? "");
      return {
        ...base,
        id: itemId(url),
        title: r.fullName,
        url,
        snippet: r.description,
        // Creation date is display-only. If the API lookup failed it falls back to `now`, which the UI treats as "unknown".
        publishedAt: new Date(Number.isNaN(created) ? now.getTime() : created).toISOString(),
        metrics: { stars: r.stars, forks: r.forks, language: r.language, starsGained: r.starsGained, period: "week" as const },
      };
    });
  }

  if (s.kind === "github") {
    const since = new Date(now.getTime() - CONFIG.repoFallbackDays * DAY).toISOString().slice(0, 10);
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
        forks: typeof r.forks_count === "number" ? r.forks_count : undefined,
        language: r.language ?? undefined,
        starsPerDay: Math.round(r.stargazers_count / Math.max(1, (now.getTime() - Date.parse(r.created_at)) / DAY)),
      },
    }));
  }

  if (s.kind === "hf") {
    const body = await get("https://huggingface.co/api/models?sort=trendingScore&direction=-1&limit=30");
    return (JSON.parse(body) as any[])
      .filter((m) => typeof m?.id === "string" && !HF_SKIP.test(m.id))
      .slice(0, s.cap)
      .map((m) => {
        const url = `https://huggingface.co/${m.id}`;
        const t = Date.parse(m.createdAt ?? m.lastModified ?? "");
        return {
          ...base,
          id: itemId(url),
          title: m.id as string,
          url,
          snippet: [m.pipeline_tag, m.library_name].filter(Boolean).join(" · "),
          // Creation date is display-only (like GitHub repos); unknown falls back to `now`.
          publishedAt: new Date(Number.isNaN(t) ? now.getTime() : t).toISOString(),
          metrics: { likes: m.likes ?? 0, downloads: m.downloads ?? 0 },
        };
      });
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
    return { ...base, ...f, ...(m && { title: m[1], source: m[2].trim() }), id: itemId(f.url), industry: s.industry };
  });
}

/** Every source in parallel; a failing source is reported in `failed` and never aborts the rest. */
export async function fetchAll(now: Date): Promise<{ items: Candidate[]; failed: string[] }> {
  const items: Candidate[] = [];
  const failed: string[] = [];
  const run = async (defs: SourceDef[]) => {
    const results = await Promise.allSettled(defs.map((s) => fetchSource(s, now)));
    results.forEach((r, i) => {
      if (r.status === "fulfilled") return void items.push(...r.value);
      failed.push(defs[i].id);
      console.error(`[sources] ${defs[i].id} failed: ${r.reason?.message ?? r.reason}`);
    });
  };
  await run(SOURCES.filter((s) => !s.fallback));
  // Fallback sources (GitHub Search) only when the primary repo sources came back (nearly) empty.
  if (items.filter((i) => i.section === "repos" && i.metrics?.likes === undefined).length < CONFIG.repoFallbackMin) await run(SOURCES.filter((s) => s.fallback));
  return { items, failed };
}
