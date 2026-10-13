import fs from "node:fs";
import path from "node:path";
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
