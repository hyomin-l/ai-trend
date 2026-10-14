import { buildLatest } from "@/lib/latest";
import { latestSnapshot } from "@/lib/snapshots";

export const dynamic = "force-static";

/** Latest edition as-is plus `sections` labels and `pet` version info, for the desk pet and other consumers. */
export function GET() {
  return Response.json(buildLatest(latestSnapshot()));
}
