// npm run collect [-- --date YYYY-MM-DD] [-- --no-llm]
import { SECTION_ORDER } from "@/config/sections";
import { CONFIG } from "@/config/sources";
import { runClaude } from "@/lib/claude";
import { curate, fallbackCuration } from "@/lib/curate";
import { buildSnapshot, kstDate, recentHeadlines, seenMap } from "@/lib/pipeline";
import { prep } from "@/lib/prep";
import { isDate, listDates, loadSnapshot, saveSnapshot, validateSnapshot } from "@/lib/snapshots";
import { fetchAll } from "@/lib/sources";

const argv = process.argv.slice(2);
const noLlm = argv.includes("--no-llm");
const dateArg = argv.includes("--date") ? argv[argv.indexOf("--date") + 1] : undefined;

async function main() {
  const now = new Date();
  const date = dateArg ?? kstDate(now);
  if (!isDate(date)) throw new Error(`--date must be YYYY-MM-DD, got "${date}"`);

  // newest first; same-day (and later) editions are excluded so a re-run never dedupes against itself
  const previous = listDates()
    .filter((d) => d < date)
    .flatMap((d) => loadSnapshot(d) ?? []);

  const { items, failed } = await fetchAll(now);
  const candidates = prep(items, { now, seen: seenMap(previous, CONFIG.dedupeEditions) });
  if (!candidates.length) {
    console.error(`No candidates (${items.length} raw items, failed: ${failed.join(", ") || "none"}). Nothing saved.`);
    process.exitCode = 1;
    return;
  }

  const curation = noLlm
    ? { ...fallbackCuration(candidates), curated: false }
    : await curate(candidates, recentHeadlines(previous, CONFIG.recentHeadlineEditions), (p) => runClaude(p, CONFIG.model));

  const snapshot = buildSnapshot({
    date, previous, collected: candidates.length, failed, now, curation,
    model: curation.curated ? CONFIG.model : "none",
  });
  const invalid = validateSnapshot(snapshot, snapshot.date);
  if (invalid.length) {
    console.error(`Snapshot failed validation, not saved:\n${invalid.join("\n")}`);
    process.exit(1);
  }
  const file = saveSnapshot(snapshot);

  console.log(`Edition ${snapshot.date} (issue ${snapshot.issue}, ${snapshot.curated ? `curated by ${snapshot.model}` : "UNCURATED"}) -> ${file}`);
  for (const s of SECTION_ORDER) {
    const n = (xs: { section: string }[]) => xs.filter((i) => i.section === s).length;
    console.log(`  ${s.padEnd(9)} candidates ${String(n(candidates)).padStart(3)}  published ${String(n(snapshot.items)).padStart(3)}`);
  }
  console.log(`  total     candidates ${String(candidates.length).padStart(3)}  published ${String(snapshot.items.length).padStart(3)}  front: ${snapshot.front.join(", ")}`);
  console.log(failed.length ? `Failed sources (${failed.length}): ${failed.join(", ")}` : "Failed sources: none");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
