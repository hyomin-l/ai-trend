import { readFileSync } from "node:fs";
import { join } from "node:path";

export const dynamic = "force-static";

/** Browsers request /favicon.ico on their own; answer with the app icon so `[lang]` never sees it. */
export function GET() {
  const svg = readFileSync(join(process.cwd(), "app", "icon.svg"));
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml" } });
}
