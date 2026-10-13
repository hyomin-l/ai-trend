import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SECTION_ORDER } from "@/config/sources";
import StoriesView from "@/components/StoriesView";
import TopBar from "@/components/TopBar";
import { LANGS, isLang, ui } from "@/lib/i18n";
import { listDates } from "@/lib/snapshots";

type Params = Promise<{ lang: string }>;

export const dynamicParams = false;

export const generateStaticParams = () => LANGS.map((lang) => ({ lang }));

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { lang } = await params;
  return isLang(lang) ? { title: ui(lang).storiesTitle } : {};
}

/** `/[lang]/stories`: every story of every edition; the browser filters search-index.json. */
export default async function StoriesPage({ params }: { params: Params }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  return (
    <>
      <a className="skip" href="#main">
        {ui(lang).skip}
      </a>
      <TopBar lang={lang} dates={listDates()} kind="stories" />
      <main id="main" lang={lang}>
        <StoriesView lang={lang} sections={SECTION_ORDER} />
      </main>
    </>
  );
}
