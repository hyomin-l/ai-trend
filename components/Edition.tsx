"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Item, Lang, Region, Section, Snapshot } from "@/types";
import { FRONT, SECTIONS, SECTION_ORDER } from "@/config/sections";
import { REGIONS } from "@/lib/i18n";
import { openParam, withoutOpen } from "@/lib/deeplink";
import { repoDesc } from "@/lib/format";
import Brief from "./Brief";
import { planGloss } from "./Glossary";
import ItemDialog from "./ItemDialog";
import Regions from "./Regions";
import RepoItem from "./RepoItem";
import SectionBlock from "./SectionBlock";
import SectionDialog from "./SectionDialog";
import StoryItem from "./StoryItem";
import styles from "./Edition.module.css";

type Props = {
  snapshot: Snapshot;
  lang: Lang;
  /** Only when something went wrong with this edition (no summaries, failed sources); shown quietly in the band's header row. */
  notice?: string;
};

/** The one-screen page: "오늘의 3줄" band (+ regions) over one column per section. Owns the region filter and the dialogs. */
export default function Edition({ snapshot, lang, notice }: Props) {
  const [region, setRegion] = useState<Region | null>(null);
  const [openItem, setOpenItem] = useState<Item | null>(null);
  const [openSection, setOpenSection] = useState<Section | null>(null);
  const [fitHidden, setFitHidden] = useState<Partial<Record<Section, number>>>({});
  const grid = useRef<HTMLDivElement>(null);
  const { generatedAt } = snapshot;

  /**
   * Safety net for the one-screen layout. Text length varies per edition, so on desktop a column that still overflows
   * hides its trailing stories (kept: at least one) and folds them into that section's "+N". Mobile and tall windows never trim.
   */
  useLayoutEffect(() => {
    const root = grid.current;
    if (!root) return;
    const desktop = window.matchMedia("(min-width: 1100px)");
    const fit = () => {
      const hidden: Partial<Record<Section, number>> = {};
      for (const col of Array.from(root.children) as HTMLElement[]) {
        const rows = [...col.querySelectorAll<HTMLElement>("[data-fit]")];
        for (const n of rows) n.hidden = false;
        if (!desktop.matches) continue;
        const over = () => col.scrollHeight > col.clientHeight + 1;
        let last = rows.length;
        while (over() && last > 1) {
          const n = rows[--last];
          n.hidden = true;
          const key = n.dataset.fit as Section;
          hidden[key] = (hidden[key] ?? 0) + 1;
        }
      }
      setFitHidden((prev) => (JSON.stringify(prev) === JSON.stringify(hidden) ? prev : hidden));
    };
    // Until the first fit the static HTML is untrimmed, so CSS keeps the columns invisible (html.js, no data-fit-ready). The
    // reveal is a plain attribute, set before paint, so the first painted frame is already the final one. If fonts are still
    // loading their line breaks are about to change, so the reveal waits for them (the CSS fallback caps the wait).
    const reveal = () => root.setAttribute("data-fit-ready", "");
    let gone = false;
    fit();
    if (document.fonts?.status === "loading")
      document.fonts.ready.then(() => {
        if (gone) return;
        fit();
        reveal();
      });
    else reveal();
    const ro = new ResizeObserver(fit);
    ro.observe(root);
    document.fonts?.addEventListener("loadingdone", fit); // web fonts change line breaks
    return () => {
      gone = true;
      ro.disconnect();
      document.fonts?.removeEventListener("loadingdone", fit);
    };
  }, [snapshot]);

  // Deep link `?open=<id>` (desk pet): open that story from the snapshot, even if display caps hide it, then drop the param.
  useEffect(() => {
    const id = openParam(window.location.search);
    if (!id) return;
    window.history.replaceState(null, "", `${window.location.pathname}${withoutOpen(window.location.search)}${window.location.hash}`);
    const item = snapshot.items.find((i) => i.id === id);
    if (item) setOpenItem(item);
  }, [snapshot]);

  const { front, bySection, shown, regions, gloss } = useMemo(() => {
    const items = snapshot.items;
    const byId = new Map(items.map((i) => [i.id, i]));
    let front = snapshot.front.map((id) => byId.get(id)).filter((i): i is Item => !!i).slice(0, FRONT.show);
    if (!front.length) front = items.slice(0, FRONT.show);
    const onFront = new Set(front.map((i) => i.id));
    // Front-page stories are not repeated in their section.
    const bySection = Object.fromEntries(
      SECTION_ORDER.map((s) => [s, items.filter((i) => i.section === s && !onFront.has(i.id))]),
    ) as Record<Section, Item[]>;
    const shown = Object.fromEntries(SECTION_ORDER.map((s) => [s, bySection[s].slice(0, SECTIONS[s].show)])) as Record<Section, Item[]>;
    // Glossary terms are marked once per edition, at their first appearance in reading order: the band, then column by column.
    const slots = [
      ...front.flatMap((i) => [
        { key: `${i.id}:t`, text: i.title[lang] },
        { key: `${i.id}:m`, text: i.summary[lang] },
      ]),
      ...SECTION_ORDER.flatMap((s) =>
        shown[s].flatMap((i) =>
          s === "repos"
            ? [{ key: `${i.id}:m`, text: repoDesc(i, lang) }]
            : [
                { key: `${i.id}:t`, text: i.title[lang] },
                { key: `${i.id}:m`, text: i.summary[lang] },
              ],
        ),
      ),
    ];
    const gloss = snapshot.glossary?.length ? planGloss(slots, snapshot.glossary) : undefined;
    const counts = new Map<Region, number>();
    for (const i of items) counts.set(i.region, (counts.get(i.region) ?? 0) + 1);
    const regions = [...counts]
      .map(([region, count]) => ({ region, count }))
      .sort((a, b) => b.count - a.count || REGIONS.indexOf(a.region) - REGIONS.indexOf(b.region));
    return { front, bySection, shown, regions, gloss };
  }, [snapshot, lang]);

  const isDimmed = (item: Item) => region !== null && item.region !== region;

  return (
    <div className={styles.root}>
      <div className={styles.band}>
        {front.length > 0 && (
          <Brief
            items={front}
            lang={lang}
            generatedAt={generatedAt}
            gloss={gloss}
            notice={notice}
            isDimmed={isDimmed}
            onOpen={setOpenItem}
          />
        )}
        <div className={styles.side}>
          <Regions regions={regions} active={region} onSelect={setRegion} lang={lang} />
        </div>
      </div>

      <div ref={grid} className={styles.grid}>
        {SECTION_ORDER.map((s) => {
          const list = bySection[s];
          if (!list.length) return null;
          const shownHere = shown[s];
          return (
            <SectionBlock
              key={s}
              id={s}
              lang={lang}
              more={list.length - shownHere.length + (fitHidden[s] ?? 0)}
              onMore={() => setOpenSection(s)}
            >
              {shownHere.map((item) =>
                s === "repos" ? (
                  <RepoItem key={item.id} item={item} lang={lang} gloss={gloss} dimmed={isDimmed(item)} onOpen={setOpenItem} />
                ) : (
                  <StoryItem
                    key={item.id}
                    item={item}
                    lang={lang}
                    generatedAt={generatedAt}
                    gloss={gloss}
                    dimmed={isDimmed(item)}
                    onOpen={setOpenItem}
                  />
                ),
              )}
            </SectionBlock>
          );
        })}
      </div>

      <SectionDialog
        section={openSection}
        items={openSection ? bySection[openSection] : []}
        lang={lang}
        generatedAt={generatedAt}
        onOpen={setOpenItem}
        onClose={() => setOpenSection(null)}
      />
      <ItemDialog
        item={openItem}
        lang={lang}
        generatedAt={generatedAt}
        glossary={snapshot.glossary}
        onClose={() => setOpenItem(null)}
      />
    </div>
  );
}
