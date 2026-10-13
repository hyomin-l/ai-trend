import { listDates, loadSnapshot } from "@/lib/snapshots";
import type { SearchRow } from "@/lib/search";

export const dynamic = "force-static";

/**
 * Compact index over every edition; the browser filters it, no search server involved. Rows carry only what the list
 * shows plus (date, id), which is the key for fetching the whole story from /editions/<date>/data.json.
 */
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
