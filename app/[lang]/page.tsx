import type { Metadata } from "next";
import { notFound } from "next/navigation";
import EditionPage from "@/components/EditionPage";
import { BRAND, LANGS, isLang } from "@/lib/i18n";

export const dynamicParams = false;

export const generateStaticParams = () => LANGS.map((lang) => ({ lang }));

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return isLang(lang) ? { description: BRAND.description[lang] } : {};
}

/** `/[lang]` is the latest edition in that language. */
export default async function LangHome({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  return <EditionPage lang={lang} />;
}
