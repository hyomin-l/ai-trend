import type { INDUSTRIES, SECTIONS } from "@/config/sections";

export type Lang = "ko" | "en";
export type Section = keyof typeof SECTIONS;
export type Region = "KR" | "US" | "EU" | "CN" | "JP" | "GLOBAL";
export type Industry = keyof typeof INDUSTRIES;
export type L10n = Record<Lang, string>;

export interface Metrics {
  stars?: number;
  /** Fork count; absent in editions collected before it was tracked. */
  forks?: number;
  /** Older editions: average stars per day since creation. Newer ones use starsGained. */
  starsPerDay?: number;
  /** Stars gained in the last `period` (GitHub trending); the repo rank. */
  starsGained?: number;
  period?: "week";
  starsDelta?: number;
  points?: number;
  comments?: number;
  language?: string;
  /** Hugging Face models: Hub likes and total downloads. */
  likes?: number;
  downloads?: number;
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

/** Plain-language explanation of a hard concept or new model/service/project name in this edition. */
export interface GlossaryEntry {
  term: string;
  desc: L10n;
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
  glossary?: GlossaryEntry[];
}

export type SourceKind = "rss" | "github" | "ghtrending" | "hn" | "hf";

export interface SourceDef {
  id: string;
  name: string;
  kind: SourceKind;
  url: string; // feed URL, GitHub topic, or HN query
  section: Section;
  cap: number;
  windowHours?: number;
  /** Allowed item URL hosts (exact match, case-insensitive); items elsewhere are dropped. Set for third-party mirrors. */
  hosts?: string[];
  industry?: Industry;
  /** Runs only when the primary repo sources yielded fewer than CONFIG.repoFallbackMin repos. */
  fallback?: boolean;
}
