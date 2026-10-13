"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Item, Lang, Region, Section, Snapshot } from "@/types";
import RepoTicker from "./RepoTicker";
import SectionBlock from "./SectionBlock";
import SectionDialog from "./SectionDialog";
import ItemDialog from "./ItemDialog";
import StoryItem, { type StoryVariant } from "./StoryItem";
import Terrain from "./Terrain";
import styles from "./Edition.module.css";

type Props = {
  snapshot: Snapshot;
  lang: Lang;
  /** Fixed per-section story counts for the one-screen page (DISPLAY in config/sources.ts). */
  display: Record<Section | "front", number>;
};

const REGION_ORDER: Region[] = ["KR", "US", "EU", "CN", "JP", "GLOBAL"];

/** The one-screen grid: 1면 + 지형 | 뉴스룸 + AX | 레포 시세표 + 펄스 + 플레이북. Owns the region filter and dialogs. */
export default function Edition({ snapshot, lang, display }: Props) {
  const [region, setRegion] = useState<Region | null>(null);
  const [openItem, setOpenItem] = useState<Item | null>(null);
  const [openSection, setOpenSection] = useState<Section | null>(null);
  const [fitHidden, setFitHidden] = useState<Partial<Record<Section, number>>>({});
  const grid = useRef<HTMLDivElement>(null);
  const { generatedAt } = snapshot;

  /**
   * Safety net for the one-screen layout: text length varies per edition, so if a desktop column still
   * overflows after the CSS density tiers, hide trailing stories (from the section showing the most) and
   * fold them into that section's "+N". Mobile and tall windows never trim.
   */
  useLayoutEffect(() => {
    const root = grid.current;
    if (!root) return;
    const desktop = window.matchMedia("(min-width: 1100px)");
    const fit = () => {
      const nodes = [...root.querySelectorAll<HTMLElement>("[data-fit]")];
      for (const n of nodes) n.hidden = false;
      const hidden: Partial<Record<Section, number>> = {};
      if (desktop.matches) {
        for (const col of Array.from(root.children) as HTMLElement[]) {
          const mine = nodes.filter((n) => col.contains(n));
          while (col.scrollHeight > col.clientHeight + 1) {
            const bySection = new Map<string, HTMLElement[]>();
            for (const n of mine) if (!n.hidden) bySection.set(n.dataset.fit!, [...(bySection.get(n.dataset.fit!) ?? []), n]);
            let pick: HTMLElement[] | undefined;
            for (const list of bySection.values()) if (list.length > 1 && (!pick || list.length >= pick.length)) pick = list;
            if (!pick) break;
            const last = pick[pick.length - 1];
            last.hidden = true;
            const key = last.dataset.fit as Section;
            hidden[key] = (hidden[key] ?? 0) + 1;
          }
        }
      }
      setFitHidden((prev) => (JSON.stringify(prev) === JSON.stringify(hidden) ? prev : hidden));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(root);
    document.fonts?.addEventListener("loadingdone", fit); // web fonts change line breaks
    return () => {
      ro.disconnect();
      document.fonts?.removeEventListener("loadingdone", fit);
    };
  }, [snapshot, display]);

  const { front, bySection, regions } = useMemo(() => {
    const items = snapshot.items;
    const byId = new Map(items.map((i) => [i.id, i]));
    let front = snapshot.front.map((id) => byId.get(id)).filter((i): i is Item => !!i).slice(0, display.front);
    if (!front.length) front = items.slice(0, display.front);
    const onFront = new Set(front.map((i) => i.id));
    const sectionItems = (s: Section) => items.filter((i) => i.section === s && !onFront.has(i.id));
    const bySection: Record<Section, Item[]> = {
      newsroom: sectionItems("newsroom"),
      ax: sectionItems("ax"),
      repos: sectionItems("repos"),
      pulse: sectionItems("pulse"),
      playbook: sectionItems("playbook"),
    };
    const counts = new Map<Region, number>();
    for (const i of items) counts.set(i.region, (counts.get(i.region) ?? 0) + 1);
    const regions = [...counts]
      .map(([region, count]) => ({ region, count }))
      .sort((a, b) => b.count - a.count || REGION_ORDER.indexOf(a.region) - REGION_ORDER.indexOf(b.region));
    return { front, bySection, regions };
  }, [snapshot, display.front]);

  const isDimmed = (item: Item) => region !== null && item.region !== region;

  const stories = (section: Section, variant: StoryVariant) => {
    const list = bySection[section];
    if (!list.length) return null;
    const shown = list.slice(0, display[section]);
    return (
      <SectionBlock
        id={section}
        lang={lang}
        more={list.length - shown.length + (fitHidden[section] ?? 0)}
        onMore={() => setOpenSection(section)}
      >
        {shown.map((item, i) => (
          <StoryItem
            key={item.id}
            item={item}
            lang={lang}
            generatedAt={generatedAt}
            variant={variant}
            first={i === 0}
            dimmed={isDimmed(item)}
            onOpen={setOpenItem}
          />
        ))}
      </SectionBlock>
    );
  };

  const repos = bySection.repos;
  const reposShown = repos.slice(0, display.repos);

  return (
    <>
      <div ref={grid} className={styles.grid}>
        <div className={styles.col}>
          {front.length > 0 && (
            <SectionBlock id="front" lang={lang}>
              {front.map((item, i) => (
                <StoryItem
                  key={item.id}
                  item={item}
                  lang={lang}
                  generatedAt={generatedAt}
                  variant={i === 0 ? "lead" : "sub"}
                  dimmed={isDimmed(item)}
                  onOpen={setOpenItem}
                />
              ))}
            </SectionBlock>
          )}
          <div className={styles.terrain}>
            <Terrain regions={regions} active={region} onSelect={setRegion} lang={lang} />
          </div>
        </div>

        <div className={styles.col}>
          {stories("newsroom", "news")}
          {stories("ax", "ax")}
        </div>

        <div className={styles.col}>
          {repos.length > 0 && (
            <SectionBlock
              id="repos"
              lang={lang}
              more={repos.length - reposShown.length + (fitHidden.repos ?? 0)}
              onMore={() => setOpenSection("repos")}
            >
              <RepoTicker items={reposShown} lang={lang} isDimmed={isDimmed} onOpen={setOpenItem} />
            </SectionBlock>
          )}
          {stories("pulse", "pulse")}
          {stories("playbook", "playbook")}
        </div>
      </div>

      <SectionDialog
        section={openSection}
        items={openSection ? bySection[openSection] : []}
        lang={lang}
        generatedAt={generatedAt}
        onOpen={setOpenItem}
        onClose={() => setOpenSection(null)}
      />
      <ItemDialog item={openItem} lang={lang} generatedAt={generatedAt} onClose={() => setOpenItem(null)} />
    </>
  );
}
