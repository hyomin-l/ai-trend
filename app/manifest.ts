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
    background_color: "#F7F7F5",
    theme_color: "#F7F7F5",
    icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
