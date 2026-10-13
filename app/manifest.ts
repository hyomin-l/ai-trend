import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/i18n";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.name,
    short_name: BRAND.short,
    description: BRAND.description.ko,
    start_url: "./",
    scope: "./",
    display: "standalone",
    background_color: BRAND.paper.light,
    theme_color: BRAND.paper.light,
    icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
