import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SECTION_ORDER } from "@/config/sources";
import SearchView from "@/components/SearchView";
import TopBar from "@/components/TopBar";
import { LANGS, isLang, ui } from "@/lib/i18n";
import { listDates } from "@/lib/snapshots";

type Params = Promise<{ lang: string }>;

export const dynamicParams = false;

export const generateStaticParams = () => LANGS.map((lang) => ({ lang }));

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { lang } = await params;
  return isLang(lang) ? { title: ui(lang).titleSearch } : {};
}

/** `/[lang]/search`: client-side filter over search-index.json. */
export default async function SearchPage({ params }: { params: Params }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  return (
    <>
      <a className="skip" href="#main">
        {ui(lang).skip}
      </a>
      <TopBar lang={lang} dates={listDates()} kind="search" />
      <main id="main" lang={lang}>
        <SearchView lang={lang} sections={SECTION_ORDER} />
      </main>
    </>
  );
}
