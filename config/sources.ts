import type { Industry, SourceDef } from "@/types";

/**
 * FORK POINT: what the collector reads and how much of it it keeps. Section keys, labels and per-column counts
 * are in config/sections.ts; the curator's editorial voice is in config/prompt.ts.
 */
export const CONFIG = {
  model: "sonnet", // `claude --model` for the curator
  timeoutMs: 180_000, // one curation call
  totalCap: 90, // candidates handed to the curator
  windowHours: 72, // news older than this is dropped
  repoFallbackDays: 30, // fallback GitHub Search only: repos created longer ago than this are not searched
  repoFallbackMin: 3, // fallback runs only when the trending sources yielded fewer repos than this
  dedupeEditions: 10, // items already published in this many past editions are skipped...
  returningGrowth: 1.5, // ...unless a repo's stars grew by this factor ("returning")
  recentHeadlineEditions: 3, // past editions whose headlines the curator is told not to repeat
};

/**
 * A trending repo is "AI-related" when its name or description matches this (trending pages carry no topics).
 * Word-boundary match, case-insensitive; add terms here, not in code.
 */
export const AI_REPO_KEYWORDS =
  /\b(ai|a\.i\.|llms?|gpts?|agents?|agentic|mcp|claude|openai|anthropic|gemini|llama|qwen|deepseek|mistral|rag|diffusion|transformers?|copilot|chatbots?|embeddings?|fine-?tun\w*|prompts?|neural|machine learning|deep learning|multimodal|generative|model context protocol|skills|vibe coding)\b/i;

const gnews = (q: string, ko: boolean) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:3d`)}` +
  (ko ? "&hl=ko&gl=KR&ceid=KR:ko" : "&hl=en-US&gl=US&ceid=US:en");

const AX_QUERIES: [Industry, string, string][] = [
  ["construction", "건설 OR 건자재 OR 시멘트 AI 도입", "construction materials AI adoption"],
  ["finance", "증권 OR 금융 생성형 AI 도입", "brokerage OR bank generative AI deployment"],
  ["logistics", "물류 AI 도입", "logistics warehouse AI adoption"],
  ["retail", "유통 OR 리테일 AI 도입", "retail AI adoption"],
  ["media", "방송 OR 언론 AI 도입", "newsroom broadcaster AI"],
];

/**
 * Add, remove or retune sources here; nothing else needs to change. `section` must be a key of config/sections.ts.
 * kind "rss": `url` is a feed (RSS or Atom). "hn": `url` is the Hacker News query.
 * kind "ghtrending": `url` is a language path of github.com/trending (weekly; "" = all languages). Scraped HTML (no official
 * API; OSS Insight's trend ranking is unavailable since 2026-03), so it is the primary repo source but may break.
 * kind "github": `url` is a repository topic (GitHub Search, new repos only) and `fallback: true` sources run only when the
 * trending sources yielded fewer than CONFIG.repoFallbackMin repos.
 * `cap` is the most items kept per source, `windowHours` overrides CONFIG.windowHours for slow feeds.
 */
export const SOURCES: SourceDef[] = [
  // Repos: most stars gained this week, regardless of creation date. Three pages x ~10 repos, AI-filtered.
  ...["", "python", "typescript"].map((l) => ({
    id: `gh-trending${l ? `-${l}` : ""}`, name: "GitHub", kind: "ghtrending" as const, url: l, section: "repos" as const, cap: 6,
  })),
  ...["llm", "ai-agents", "mcp", "generative-ai"].map((t) => ({
    id: `gh-${t}`, name: "GitHub", kind: "github" as const, url: t, section: "repos" as const, cap: 6, fallback: true,
  })),
  { id: "hn", name: "Hacker News", kind: "hn", url: "AI", section: "pulse", cap: 8 },
  // One multireddit request: Reddit allows ~1 unauthenticated request per minute per IP, so three feeds in parallel always 429.
  // t=day (top of the last 24h) would return only ~25 posts per multireddit and miss anything older than a day that is
  // still inside the 72h window; t=week + the default 72h filter keeps ~3 days of the best posts.
  { id: "reddit", name: "Reddit", kind: "rss", url: "https://www.reddit.com/r/LocalLLaMA+ClaudeAI+MachineLearning/top/.rss?t=week", section: "pulse", cap: 8 },
  { id: "geeknews", name: "GeekNews", kind: "rss", url: "https://news.hada.io/rss/news", section: "pulse", cap: 6 },
  { id: "techcrunch", name: "TechCrunch", kind: "rss", url: "https://techcrunch.com/category/artificial-intelligence/feed/", section: "newsroom", cap: 8 },
  { id: "verge", name: "The Verge", kind: "rss", url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", section: "newsroom", cap: 6 },
  { id: "aitimes", name: "AI타임스", kind: "rss", url: "https://www.aitimes.com/rss/allArticle.xml", section: "newsroom", cap: 8 },
  { id: "gnews-ax-ko", name: "Google News", kind: "rss", url: gnews("기업 AX OR AI 전환", true), section: "ax", cap: 4 },
  { id: "gnews-ax-en", name: "Google News", kind: "rss", url: gnews("enterprise AI adoption", false), section: "ax", cap: 4 },
  ...AX_QUERIES.flatMap(([industry, ko, en]) => [
    { id: `gnews-${industry}-ko`, name: "Google News", kind: "rss" as const, url: gnews(ko, true), section: "ax" as const, cap: 3, industry },
    { id: `gnews-${industry}-en`, name: "Google News", kind: "rss" as const, url: gnews(en, false), section: "ax" as const, cap: 3, industry },
  ]),
  { id: "simonw", name: "Simon Willison", kind: "rss", url: "https://simonwillison.net/atom/everything/", section: "playbook", cap: 5 },
  { id: "latentspace", name: "Latent Space", kind: "rss", url: "https://www.latent.space/feed", section: "playbook", cap: 3, windowHours: 168 },
  { id: "uxcollective", name: "UX Collective", kind: "rss", url: "https://uxdesign.cc/feed", section: "playbook", cap: 4, windowHours: 168 },
  { id: "oneusefulthing", name: "One Useful Thing", kind: "rss", url: "https://www.oneusefulthing.org/feed", section: "playbook", cap: 2, windowHours: 168 },
  { id: "nngroup", name: "NN/g", kind: "rss", url: "https://www.nngroup.com/feed/rss/", section: "playbook", cap: 3, windowHours: 168 },
];
