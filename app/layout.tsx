import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Instrument_Serif, Newsreader, Noto_Serif_KR } from "next/font/google";
import { BRAND } from "@/lib/i18n";
import "./globals.css";

const wordmark = Instrument_Serif({ weight: "400", subsets: ["latin"], variable: "--f-wordmark", display: "swap" });
const hlKo = Noto_Serif_KR({ weight: ["600", "700"], preload: false, variable: "--f-hl-ko", display: "swap" });
const hlEn = Newsreader({ weight: "600", subsets: ["latin"], variable: "--f-hl-en", display: "swap" });
const mono = IBM_Plex_Mono({ weight: ["400", "500"], subsets: ["latin"], variable: "--f-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: BRAND.name, template: `%s · ${BRAND.name}` },
  description: BRAND.description.ko,
  applicationName: BRAND.name,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F7F5" },
    { media: "(prefers-color-scheme: dark)", color: "#111112" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${wordmark.variable} ${hlKo.variable} ${hlEn.variable} ${mono.variable}`}>
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
