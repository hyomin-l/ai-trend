import { listDates, loadSnapshot } from "@/lib/snapshots";

export const dynamic = "force-static";
export const dynamicParams = false;

/** `output: "export"` rejects an empty generateStaticParams(); before the first edition we emit one placeholder that serves `{}`. */
const PLACEHOLDER = "0000-00-00";

export function generateStaticParams() {
  const dates = listDates();
  return (dates.length ? dates : [PLACEHOLDER]).map((date) => ({ date }));
}

/** One whole edition at `/editions/<date>/data.json`: the archive fetches it when a search result is opened in the dialog. */
export async function GET(_req: Request, { params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  return Response.json(loadSnapshot(date) ?? {});
}
