import { latestSnapshot } from "@/lib/snapshots";

export const dynamic = "force-static";

/** Latest edition as-is, for the desk pet and other consumers. `{}` while no edition exists. */
export function GET() {
  return Response.json(latestSnapshot() ?? {});
}
