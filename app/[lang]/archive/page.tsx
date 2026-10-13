import { ViewTransition } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ArchiveView, { type ArchiveEdition } from "@/components/ArchiveView";
import type { Item } from "@/types";
import TopBar from "@/components/TopBar";
import { LANGS, isLang, ui } from "@/lib/i18n";
import { listDates, loadSnapshot } from "@/lib/snapshots";

type Params = Promise<{ lang: string }>;

export const dynamicParams = false;

export const generateStaticParams = () => LANGS.map((lang) => ({ lang }));

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { lang } = await params;
  return isLang(lang) ? { title: ui(lang).archiveTitle } : {};
}

/** `/[lang]/archive`: every edition, newest first, with its three lead headlines. */
export default async function ArchivePage({ params }: { params: Params }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const dates = listDates();
  const editions: ArchiveEdition[] = dates.flatMap((date) => {
    const s = loadSnapshot(date);
    if (!s) return [];
    const byId = new Map(s.items.map((i) => [i.id, i]));
    const lead = s.front.map((id) => byId.get(id)).filter((i): i is Item => !!i);
    return [{ date, issue: s.issue, heads: (lead.length ? lead : s.items.slice(0, 3)).map((i) => i.title[lang]) }];
  });
  return (
    <>
      <a className="skip" href="#main">
        {ui(lang).skip}
      </a>
      <TopBar lang={lang} dates={dates} kind="archive" />
      <ViewTransition>
        <main id="main" lang={lang}>
          <ArchiveView lang={lang} editions={editions} />
        </main>
      </ViewTransition>
    </>
  );
}
