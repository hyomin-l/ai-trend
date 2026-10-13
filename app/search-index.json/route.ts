import { listDates, loadSnapshot } from "@/lib/snapshots";
import type { SearchRow } from "@/components/SearchView";

export const dynamic = "force-static";

/** Compact index over every edition; the browser filters it, no search server involved. */
export function GET() {
  const rows: SearchRow[] = listDates().flatMap((d) => {
    const s = loadSnapshot(d);
    return (s?.items ?? []).map((i) => ({
      d: s!.date,
      i: s!.issue,
      s: i.section,
      id: i.id,
      t: i.title,
      m: i.summary,
      src: i.source,
      u: i.url,
    }));
  });
  return Response.json(rows);
}
