import { AI_REPO_KEYWORDS, CONFIG, FETCHING, HF_SKIP, SOURCES } from "@/config/sources";
import { itemId, type Candidate } from "@/lib/prep";
import { parseFeed } from "@/lib/rss";
import { parseTrending } from "@/lib/trending";
import type { SourceDef } from "@/types";

const UA = `ai-trend/0.1 (+https://github.com/${process.env.GITHUB_REPOSITORY || "hyomin-l/ai-trend"})`;
const DAY = 86_400_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET, or a form POST when `form` is given. */
async function get(url: string, headers: Record<string, string> = {}, form?: URLSearchParams): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { method: form ? "POST" : "GET", body: form, headers: { "User-Agent": UA, ...headers }, signal: AbortSignal.timeout(15_000) });
    if (res.ok) return res.text();
    if (attempt >= FETCHING.retries || (res.status !== 429 && res.status < 500)) throw new Error(`HTTP ${res.status}`);
    await res.body?.cancel();
    const after = Number(res.headers.get("retry-after")) * 1000; // seconds form only; an HTTP date falls back to backoff
    await sleep(Math.min(after > 0 ? after : FETCHING.retryMs * 3 ** attempt, 10_000));
  }
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

  if (s.kind === "hfpapers") {
    const body = await get("https://huggingface.co/api/daily_papers?limit=50");
    const seen = new Set<string>();
    return (JSON.parse(body) as any[])
      .filter((d) => typeof d?.paper?.id === "string" && typeof d.paper.title === "string" && (d.paper.upvotes ?? 0) >= (s.minUpvotes ?? 0))
      .sort((a, b) => b.paper.upvotes - a.paper.upvotes)
      .filter((d) => !seen.has(d.paper.id) && !!seen.add(d.paper.id))
      .slice(0, s.cap)
      .map((d) => {
        const url = `https://huggingface.co/papers/${d.paper.id}`;
        const t = Date.parse(d.paper.submittedOnDailyAt ?? d.publishedAt ?? "");
        return {
          ...base,
          id: itemId(url),
          title: d.paper.title as string,
          url,
          snippet: String(d.paper.summary ?? "").replace(/\s+/g, " ").trim(),
          content: String(d.paper.summary ?? "").replace(/\s+/g, " ").trim().slice(0, 12000),
          // The day it was featured on Daily Papers (the arXiv date can be weeks older); unknown falls back to `now`.
          publishedAt: new Date(Number.isNaN(t) ? now.getTime() : t).toISOString(),
          metrics: { upvotes: d.paper.upvotes as number },
        };
      });
  }

  if (s.kind === "reddit") {
    const { REDDIT_CLIENT_ID: id, REDDIT_CLIENT_SECRET: secret } = process.env;
    if (!id || !secret) {
      console.warn(`[sources] ${s.id} skipped: REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET not set`);
      return [];
    }
    const token = await get(
      "https://www.reddit.com/api/v1/access_token",
      { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}` },
      new URLSearchParams({ grant_type: "client_credentials" }),
    );
    const body = await get(`https://oauth.reddit.com/r/${s.url}/top?t=week&limit=50&raw_json=1`, {
      Authorization: `Bearer ${JSON.parse(token).access_token}`,
    });
    return (JSON.parse(body).data.children as any[]).map(({ data: p }) => {
      const url = `https://www.reddit.com${p.permalink}`; // the thread, as the RSS feed linked it, so past editions still dedupe
      const text = String(p.selftext ?? "").replace(/\s+/g, " ").trim();
      return {
        ...base,
        id: itemId(url),
        title: p.title,
        url,
        snippet: text.slice(0, 300) || `r/${p.subreddit} · ${p.score} points · ${p.num_comments} comments`,
        ...(text.length >= 300 && { content: text.slice(0, 12000) }),
        publishedAt: new Date(p.created_utc * 1000).toISOString(),
        metrics: { points: p.score, comments: p.num_comments },
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
  const wanted = s.categories?.map((c) => c.toLowerCase());
  // Feeds are not strictly date-sorted (OpenAI): when filtering by category, order newest first so the cap keeps the latest.
  const kept = wanted
    ? feed
        .filter((f) => f.categories?.some((c) => wanted.includes(c.toLowerCase())))
        .sort((a, b) => Date.parse(b.publishedAt ?? "") - Date.parse(a.publishedAt ?? "") || 0)
    : feed;
  return kept.map(({ categories: _c, ...f }) => {
    // Google News titles end with " - Publisher"; surface the real outlet as the source.
    const m = s.name === "Google News" ? f.title.match(/^(.*\S)\s+-\s+([^-]+)$/) : null;
    return { ...base, ...f, ...(m && { title: m[1], source: m[2].trim() }), id: itemId(f.url), industry: s.industry };
  });
}

/**
 * Every source in parallel, except feeds on FETCHING.serialHosts: those queue per host, gapMs apart.
 * A failing source is reported in `failed` and never aborts the rest.
 */
export async function fetchAll(now: Date): Promise<{ items: Candidate[]; failed: string[] }> {
  const items: Candidate[] = [];
  const failed: string[] = [];
  const queues = new Map<string, Promise<unknown>>();
  const fetchOne = async (s: SourceDef) => { // async: a bad URL rejects this source only instead of throwing out of map()
    const host = s.kind === "rss" ? new URL(s.url).hostname : "";
    if (!FETCHING.serialHosts.includes(host)) return fetchSource(s, now);
    const turn = (queues.get(host) ?? Promise.resolve()).then(() => fetchSource(s, now));
    queues.set(host, turn.catch(() => {}).then(() => sleep(FETCHING.gapMs)));
    return turn;
  };
  const run = async (defs: SourceDef[]) => {
    const results = await Promise.allSettled(defs.map(fetchOne));
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
