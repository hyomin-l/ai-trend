import type { Metadata } from "next";
import { notFound } from "next/navigation";
import EditionPage from "@/components/EditionPage";
import { BRAND, LANGS, isLang, ui } from "@/lib/i18n";
import { fmtDateYMD } from "@/lib/format";
import { listDates, loadSnapshot } from "@/lib/snapshots";

type Params = Promise<{ lang: string; date: string }>;

export const dynamicParams = false;

/**
 * `output: "export"` rejects an empty generateStaticParams(), so before the first edition exists we emit
 * one placeholder route that renders the empty state. It is unlinked and disappears with the first edition.
 */
const PLACEHOLDER_DATE = "0000-00-00";

export function generateStaticParams() {
  const dates = listDates();
  if (dates.length === 0) return [{ lang: "ko", date: PLACEHOLDER_DATE }];
  return LANGS.flatMap((lang) => dates.map((date) => ({ lang, date })));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { lang, date } = await params;
  const snapshot = isLang(lang) ? loadSnapshot(date) : null;
  if (!isLang(lang) || !snapshot) return {};
  return {
    title: `${fmtDateYMD(date, lang)} · ${ui(lang).issue(snapshot.issue)}`,
    description: BRAND.description[lang],
  };
}

/** `/[lang]/[date]` is one archived edition. */
export default async function EditionByDate({ params }: { params: Params }) {
  const { lang, date } = await params;
  if (!isLang(lang)) notFound();
  if (date === PLACEHOLDER_DATE && listDates().length === 0) return <EditionPage lang={lang} />;
  return <EditionPage lang={lang} date={date} />;
}
