import type { Metadata, Viewport } from "next";
import { BRAND } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: BRAND.name, template: `%s · ${BRAND.name}` },
  description: BRAND.description.ko,
  applicationName: BRAND.name,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: BRAND.paper.light },
    { media: "(prefers-color-scheme: dark)", color: BRAND.paper.dark },
  ],
};

/** localStorage key; components/ThemeToggle.tsx writes it. */
const THEME_KEY = "ai-trend-theme";

/** Runs before first paint: a saved light/dark choice pins <html data-theme>; with none, CSS follows the system. */
const THEME_BOOT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        {/* Pretendard: body, meta, numbers. Wanted Sans: the display face for logo, numerals, headlines and labels. */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/wanteddev/wanted-sans@v1.0.3/packages/wanted-sans/fonts/webfonts/variable/split/WantedSansVariable.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
