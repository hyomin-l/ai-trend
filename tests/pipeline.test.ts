import { describe, expect, it } from "vitest";
import type { Item, Snapshot } from "@/types";
import { buildSnapshot, kstDate, recentHeadlines, seenMap } from "@/lib/pipeline";

const item = (id: string, over: Partial<Item> = {}): Item => ({
  id, section: "newsroom", source: "S", url: `https://e.com/${id}`, publishedAt: "2026-10-10T00:00:00.000Z",
  region: "US", title: { ko: `헤드라인 ${id}`, en: `Headline ${id}` }, summary: { ko: "", en: "" }, takeaway: { ko: "", en: "" },
  ...over,
});
const snap = (date: string, items: Item[], issue = 1): Snapshot => ({
  date, issue, generatedAt: `${date}T00:00:00.000Z`, model: "sonnet", curated: true, failedSources: [],
  stats: { collected: 10, published: items.length }, front: items.slice(0, 3).map((i) => i.id), items,
});

// newest first, as scripts/collect.ts passes them
const previous = [
  snap("2026-10-10", [item("a"), item("r1", { section: "repos", metrics: { stars: 900 } })]),
  snap("2026-10-08", [item("b"), item("r1", { section: "repos", metrics: { stars: 400 } })]),
  snap("2026-10-06", [item("c"), item("old", { section: "repos", metrics: { stars: 50 } })]),
];

describe("kstDate", () => {
  it("PRD-schedule: 05:17 KST on Oct 13 (20:17Z on Oct 12) is the Oct 13 edition", () => {
    expect(kstDate(new Date("2026-10-12T20:17:00Z"))).toBe("2026-10-13");
  });
  it("PRD-snapshot-store: the date flips exactly at 00:00 KST (15:00Z)", () => {
    expect(kstDate(new Date("2026-10-12T14:59:59Z"))).toBe("2026-10-12");
    expect(kstDate(new Date("2026-10-12T15:00:00Z"))).toBe("2026-10-13");
  });
});

describe("seenMap", () => {
  it("PRD-collector: maps ids to stars from the n newest editions only", () => {
    const m = seenMap(previous, 2);
    expect([...m.keys()].sort()).toEqual(["a", "b", "r1"]);
    expect(m.has("c")).toBe(false);
    expect(m.has("old")).toBe(false);
  });

  it("PRD-collector: a repeated id takes the stars of its most recent appearance", () => {
    expect(seenMap(previous, 3).get("r1")).toEqual({ stars: 900, ago: 1 });
  });

  it("PRD-collector: non-repo ids are present with undefined stars", () => {
    const m = seenMap(previous, 1);
    expect(m.has("a")).toBe(true);
    expect(m.get("a")).toEqual({ stars: undefined, ago: 1 });
  });

  it("PRD-collector: records how many editions back an id last appeared (1 = newest)", () => {
    const m = seenMap(previous, 3);
    expect(m.get("b")?.ago).toBe(2);
    expect(m.get("old")?.ago).toBe(3);
  });

  it("PRD-collector: does not depend on the caller's ordering", () => {
    expect([...seenMap([...previous].reverse(), 1).keys()].sort()).toEqual(["a", "r1"]);
  });

  it("PRD-collector: no previous editions gives an empty map", () => {
    expect(seenMap([], 10).size).toBe(0);
  });
});

describe("recentHeadlines", () => {
  it("PRD-curator: collects title.ko from the n newest editions, newest first", () => {
    expect(recentHeadlines(previous, 2)).toEqual(["헤드라인 a", "헤드라인 r1", "헤드라인 b", "헤드라인 r1"]);
  });
  it("PRD-curator: n larger than history is fine", () => {
    expect(recentHeadlines(previous.slice(0, 1), 3)).toHaveLength(2);
  });
});

describe("buildSnapshot freshness guard", () => {
  const now = new Date("2026-10-13T00:00:00Z");
  const ago = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
  const run = (items: Item[], front: string[]) =>
    buildSnapshot({ date: "2026-10-13", previous: [], collected: 9, failed: [], model: "sonnet", now, curation: { front, items, glossary: [], curated: true } });

  it("drops newsroom/ax/pulse items older than 72h, keeps playbook and repos, and repairs front", () => {
    const items = [
      item("old", { publishedAt: ago(150) }),
      item("oldPulse", { section: "pulse", publishedAt: ago(155) }),
      item("oldAx", { section: "ax", publishedAt: ago(73) }),
      item("fresh", { publishedAt: ago(70) }),
      item("pb", { section: "playbook", publishedAt: ago(150) }),
      item("rp", { section: "repos", publishedAt: ago(24 * 400) }),
    ];
    const s = run(items, ["old", "fresh", "oldPulse"]);
    expect(s.items.map((i) => i.id)).toEqual(["fresh", "pb", "rp"]);
    expect(s.front).toEqual(["fresh", "pb", "rp"]);
    expect(s.stats.published).toBe(3);
  });

  it("leaves a fully fresh edition untouched", () => {
    const items = [item("a", { publishedAt: ago(1) }), item("b", { publishedAt: ago(2) })];
    const s = run(items, ["a", "b"]);
    expect(s.items).toHaveLength(2);
    expect(s.front).toEqual(["a", "b"]);
  });
});

describe("buildSnapshot", () => {
  const curation = { front: ["x", "y", "z"], items: [item("x"), item("y"), item("z"), item("w")], glossary: [], curated: true };
  const base = {
    date: "2026-10-13", collected: 77, failed: ["reddit"], model: "sonnet",
    now: new Date("2026-10-12T20:17:00Z"), curation,
  };

  it("PRD-snapshot-store: issue is the number of previous snapshots + 1", () => {
    expect(buildSnapshot({ ...base, previous }).issue).toBe(4);
    expect(buildSnapshot({ ...base, previous: [] }).issue).toBe(1);
  });

  it("PLAN-review4: re-running the same date keeps the issue number when previous excludes that date", () => {
    const first = buildSnapshot({ ...base, previous });
    const rerunPrevious = [...previous, first].filter((s) => s.date < base.date); // what collect.ts computes
    expect(buildSnapshot({ ...base, previous: rerunPrevious }).issue).toBe(first.issue);
  });

  it("PRD-collector: stats = collected from the candidate count, published from curated items", () => {
    expect(buildSnapshot({ ...base, previous }).stats).toEqual({ collected: 77, published: 4 });
  });

  it("PRD-glossary: carries the curation glossary into the snapshot", () => {
    const glossary = [{ term: "양자화", desc: { ko: "모델을 가볍게 줄이는 기법", en: "Shrinking a model to run cheaper" } }];
    expect(buildSnapshot({ ...base, previous, curation: { ...curation, glossary } }).glossary).toEqual(glossary);
  });

  it("PRD-glossary: an empty glossary omits the key (old and uncurated snapshots keep their shape)", () => {
    expect("glossary" in buildSnapshot({ ...base, previous, curation: { ...curation, glossary: [] } })).toBe(false);
  });

  it("PRD-snapshot-store: carries date, model, curated, failedSources, front, items and an ISO generatedAt", () => {
    const s = buildSnapshot({ ...base, previous, curation: { ...curation, curated: false } });
    expect(s).toMatchObject({
      date: "2026-10-13", model: "sonnet", curated: false, failedSources: ["reddit"],
      front: ["x", "y", "z"], generatedAt: "2026-10-12T20:17:00.000Z",
    });
    expect(s.items).toBe(curation.items);
  });
});
