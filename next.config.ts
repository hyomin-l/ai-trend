import type { NextConfig } from "next";

// Empty for local dev; the workflow passes the Pages base path (e.g. /ai-trend, or "" for a user site).
const basePath = process.env.BASE_PATH ?? "";

const config: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default config;
