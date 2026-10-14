import fs from "node:fs";
import path from "node:path";
import { SECTION_ORDER } from "@/config/sections";
import { isWebUrl } from "@/lib/format";
import { REGIONS } from "@/lib/i18n";
import type { Snapshot } from "@/types";

export const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export const snapshotDir = () =>
  process.env.SNAPSHOT_DIR ?? path.join(process.cwd(), "data", "snapshots");

/** Edition dates, newest first. */
export function listDates(dir = snapshotDir()): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .map((f) => f.replace(/\.json$/, ""))
    .filter(isDate)
    .sort()
    .reverse();
}

export function loadSnapshot(date: string, dir = snapshotDir()): Snapshot | null {
  if (!isDate(date)) return null;
  const file = path.join(dir, `${date}.json`);
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as Snapshot) : null;
}

export function latestSnapshot(dir = snapshotDir()): Snapshot | null {
  const [latest] = listDates(dir);
  return latest ? loadSnapshot(latest, dir) : null;
}

export function saveSnapshot(s: Snapshot, dir = snapshotDir()): string {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${s.date}.json`);
  fs.writeFileSync(file, JSON.stringify(s, null, 2) + "\n");
  return file;
}

/** Sanity bound for any numeric metric; larger values mean a scraping bug, never a real count. */
const MAX_METRIC = 1e9;
const isStr = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const isL10n = (v: unknown) => !!v && typeof v === "object" && isStr((v as any).ko) && isStr((v as any).en);

/** Structural check of a snapshot (e.g. after a hand edit). Returns human-readable errors; empty means valid. `file` is the expected date. */
export function validateSnapshot(s: unknown, file: string): string[] {
  const errs: string[] = [];
  const err = (where: string, msg: string) => errs.push(`${file}${where ? ` ${where}` : ""}: ${msg}`);
  if (!s || typeof s !== "object") return [`${file}: not an object`];
  const snap = s as Record<string, any>;

  if (!isDate(String(snap.date)) || snap.date !== file) err("", `date "${snap.date}" does not match filename or is not YYYY-MM-DD`);
  if (!Number.isInteger(snap.issue) || snap.issue < 1) err("", `issue must be a positive integer, got ${JSON.stringify(snap.issue)}`);
  if (!Array.isArray(snap.items)) { err("", "items must be an array"); return errs; }

  const ids = new Set<string>();
  snap.items.forEach((it: any, i: number) => {
    const w = `item ${isStr(it?.id) ? it.id : `#${i}`}`;
    if (!it || typeof it !== "object") return err(w, "not an object");
    if (!isStr(it.id)) err(w, "id missing");
    else if (ids.has(it.id)) err(w, "duplicate id");
    else ids.add(it.id);
    if (!isStr(it.url) || !isWebUrl(it.url)) err(w, `url is not an http(s) link: ${JSON.stringify(it.url)}`);
    if (!SECTION_ORDER.includes(it.section)) err(w, `unknown section ${JSON.stringify(it.section)}`);
    if (!REGIONS.includes(it.region)) err(w, `unknown region ${JSON.stringify(it.region)}`);
    if (!isStr(it.source)) err(w, "source missing");
    if (!isStr(it.publishedAt)) err(w, "publishedAt missing");
    if (it.metrics !== undefined) {
      if (!it.metrics || typeof it.metrics !== "object") err(w, "metrics must be an object");
      else for (const [k, v] of Object.entries(it.metrics))
        if (typeof v === "number" && !(Number.isFinite(v) && v >= 0 && v < MAX_METRIC)) err(w, `metrics.${k} out of range: ${v}`);
    }
    // An uncurated (--no-llm) edition copies feed snippets and has no takeaway, so only the title is required there.
    for (const f of snap.curated === false ? ["title"] : ["title", "summary", "takeaway"])
      if (!isL10n(it[f])) err(w, `${f} needs non-empty ko and en`);
  });

  if (!Array.isArray(snap.front)) err("", "front must be an array");
  else for (const id of snap.front) if (!ids.has(id)) err("", `front id ${JSON.stringify(id)} is not in items`);

  if (snap.glossary !== undefined) {
    if (!Array.isArray(snap.glossary)) err("", "glossary must be an array");
    else snap.glossary.forEach((g: any, i: number) => {
      if (!isStr(g?.term) || !isL10n(g?.desc)) err(`glossary #${i}`, "needs term and desc with non-empty ko and en");
    });
  }
  return errs;
}
