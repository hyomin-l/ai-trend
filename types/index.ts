export type Lang = "ko" | "en";
export type Section = "repos" | "pulse" | "newsroom" | "ax" | "playbook";
export type Region = "KR" | "US" | "EU" | "CN" | "JP" | "GLOBAL";
export type Industry = "construction" | "finance" | "logistics" | "retail" | "media";
export type L10n = Record<Lang, string>;

export interface Metrics {
  stars?: number;
  starsPerDay?: number;
  starsDelta?: number;
  points?: number;
  comments?: number;
  language?: string;
}

/** Normalized candidate produced by the collector, before curation. */
export interface RawItem {
  id: string;
  source: string;
  section: Section;
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string;
  industry?: Industry;
  metrics?: Metrics;
  returning?: boolean;
}

/** Published, curated story inside a snapshot. */
export interface Item {
  id: string;
  section: Section;
  source: string;
  url: string;
  publishedAt: string;
  region: Region;
  industry?: Industry;
  title: L10n;
  summary: L10n;
  takeaway: L10n;
  metrics?: Metrics;
  returning?: boolean;
}

export interface Snapshot {
  date: string; // YYYY-MM-DD (KST)
  issue: number;
  generatedAt: string;
  model: string;
  curated: boolean;
  failedSources: string[];
  stats: { collected: number; published: number };
  front: string[]; // item ids, lead first
  items: Item[];
}

export type SourceKind = "rss" | "github" | "hn";

export interface SourceDef {
  id: string;
  name: string;
  kind: SourceKind;
  url: string; // feed URL, GitHub topic, or HN query
  section: Section;
  cap: number;
  windowHours?: number;
  industry?: Industry;
}
