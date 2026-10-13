import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RawItem } from "@/types";
import { SYSTEM_PROMPT, buildPrompt, curate, fallbackCuration, parseCuration, runClaude } from "@/lib/curate";

const raw = (id: string, over: Partial<RawItem> = {}): RawItem => ({
  id, source: "Src", section: "newsroom", title: `Title ${id}`, url: `https://example.com/${id}`,
  snippet: `Snippet ${id}`, publishedAt: "2026-10-13T00:00:00.000Z", ...over,
});
const candidates: RawItem[] = [
  raw("a1", { source: "TechCrunch" }),
  raw("b2", { section: "repos", source: "GitHub", metrics: { stars: 1200, starsPerDay: 80, language: "Rust" }, returning: true }),
  raw("c3", { section: "ax", source: "Google News", industry: "finance" }),
  raw("d4", { section: "pulse", source: "Hacker News", metrics: { points: 300, comments: 120 } }),
  raw("e5", { section: "playbook" }),
];
const entry = (id: string, over: Record<string, unknown> = {}) => ({
  id, section: "newsroom", region: "US",
  title: { ko: `제목 ${id}`, en: `Title ${id}` },
  summary: { ko: `요약 ${id}`, en: `Summary ${id}` },
  takeaway: { ko: `시사점 ${id}`, en: `Takeaway ${id}` },
  ...over,
});
const json = (items: unknown[], front: unknown = ["a1", "b2", "c3"]) => JSON.stringify({ front, items });

describe("parseCuration", () => {
  const good = json([entry("a1"), entry("b2", { section: "repos" }), entry("c3", { section: "ax", industry: "finance" })]);

  it("PRD-curator: accepts clean JSON and merges url/source/publishedAt/metrics from the candidate", () => {
    const res = parseCuration(good, candidates)!;
    expect(res.front).toEqual(["a1", "b2", "c3"]);
    expect(res.items.map((i) => i.id)).toEqual(["a1", "b2", "c3"]);
    const b2 = res.items[1];
    expect(b2).toMatchObject({
      url: "https://example.com/b2", source: "GitHub", publishedAt: "2026-10-13T00:00:00.000Z",
      metrics: { stars: 1200, starsPerDay: 80, language: "Rust" }, returning: true, section: "repos", region: "US",
      title: { ko: "제목 b2", en: "Title b2" }, summary: { ko: "요약 b2", en: "Summary b2" },
      takeaway: { ko: "시사점 b2", en: "Takeaway b2" },
    });
  });

  it("PLAN-review2: accepts a ```json fenced response", () => {
    expect(parseCuration("```json\n" + good + "\n```", candidates)?.items).toHaveLength(3);
  });

  it("PLAN-review2: accepts prose before and after the JSON block", () => {
    expect(parseCuration(`Sure, here is the edition:\n${good}\nHope it helps!`, candidates)?.items).toHaveLength(3);
  });

  it("PLAN-review3: drops ids that are not in the candidates", () => {
    const res = parseCuration(json([entry("a1"), entry("zzz"), entry("b2")]), candidates)!;
    expect(res.items.map((i) => i.id)).toEqual(["a1", "b2"]);
  });

  it("PLAN-review3: drops duplicate ids (first wins)", () => {
    const res = parseCuration(json([entry("a1"), entry("a1", { title: { ko: "다른", en: "Other" } })]), candidates)!;
    expect(res.items).toHaveLength(1);
    expect(res.items[0].title.en).toBe("Title a1");
  });

  it("PLAN-review3: drops items with an invalid section", () => {
    const res = parseCuration(json([entry("a1", { section: "sports" }), entry("b2")]), candidates)!;
    expect(res.items.map((i) => i.id)).toEqual(["b2"]);
  });

  it("PRD-curator: drops items missing a ko or en title", () => {
    const res = parseCuration(
      json([entry("a1", { title: { ko: "제목만" } }), entry("b2", { title: undefined }), entry("c3")]),
      candidates,
    )!;
    expect(res.items.map((i) => i.id)).toEqual(["c3"]);
  });

  it("PRD-curator: ignores any url the model returns (hallucination guard)", () => {
    const res = parseCuration(json([entry("a1", { url: "https://evil.example/phish" })]), candidates)!;
    expect(res.items[0].url).toBe("https://example.com/a1");
  });

  it("PLAN-review3: invalid front ids are replaced by the first 3 item ids", () => {
    const items = [entry("a1"), entry("b2"), entry("c3"), entry("d4")];
    expect(parseCuration(json(items, ["x", "y", "z"]), candidates)!.front).toEqual(["a1", "b2", "c3"]);
    expect(parseCuration(json(items, undefined), candidates)!.front).toEqual(["a1", "b2", "c3"]);
    expect(parseCuration(json(items, "d4"), candidates)!.front).toEqual(["a1", "b2", "c3"]);
  });

  it("PLAN-review3: partially valid front keeps the valid ids first and tops up from items", () => {
    const items = [entry("a1"), entry("b2"), entry("c3"), entry("d4")];
    expect(parseCuration(json(items, ["d4", "nope", "d4"]), candidates)!.front).toEqual(["d4", "a1", "b2"]);
  });

  it("PRD-curator: industry comes from the model for ax, falls back to the candidate, and is dropped outside ax", () => {
    const res = parseCuration(
      json([
        entry("c3", { section: "ax", industry: "retail" }),
        entry("a1", { section: "ax" }),
        entry("b2", { section: "repos", industry: "media" }),
      ]),
      [...candidates.slice(0, 1).map((c) => ({ ...c, industry: "logistics" as const })), ...candidates.slice(1)],
    )!;
    const byId = Object.fromEntries(res.items.map((i) => [i.id, i]));
    expect(byId.c3.industry).toBe("retail");
    expect(byId.a1.industry).toBe("logistics");
    expect(byId.b2.industry).toBeUndefined();
  });

  it("PRD-curator: invalid region falls back to KR for Hangul titles, else GLOBAL", () => {
    const cands = [raw("k1", { title: "삼성, 새 AI 발표" }), raw("g1")];
    const res = parseCuration(json([entry("k1", { region: "MARS" }), entry("g1", { region: null })]), cands)!;
    expect(res.items.map((i) => i.region)).toEqual(["KR", "GLOBAL"]);
  });

  it("PRD-curator: garbage, non-JSON or zero valid items give null", () => {
    expect(parseCuration("I cannot do that.", candidates)).toBeNull();
    expect(parseCuration("{not json at all}", candidates)).toBeNull();
    expect(parseCuration('{"front":[],"items":"nope"}', candidates)).toBeNull();
    expect(parseCuration(json([entry("zzz")]), candidates)).toBeNull();
    expect(parseCuration("", candidates)).toBeNull();
  });
});

describe("fallbackCuration", () => {
  it("PRD-curator: uses original title/snippet, empty takeaway, Hangul => KR else GLOBAL", () => {
    const cands = [raw("k1", { title: "삼성 AI", snippet: "스니펫" }), raw("g1", { source: "Verge" })];
    const { front, items } = fallbackCuration(cands);
    expect(items.find((i) => i.id === "k1")).toMatchObject({
      title: { ko: "삼성 AI", en: "삼성 AI" }, summary: { ko: "스니펫", en: "스니펫" },
      takeaway: { ko: "", en: "" }, region: "KR", url: "https://example.com/k1",
    });
    expect(items.find((i) => i.id === "g1")!.region).toBe("GLOBAL");
    expect(front).toEqual(items.slice(0, 3).map((i) => i.id));
  });

  it("PRD-curator: keeps about 5 per section", () => {
    const many = Array.from({ length: 20 }, (_, i) => raw(`n${i}`)).concat(
      Array.from({ length: 20 }, (_, i) => raw(`r${i}`, { section: "repos" })),
    );
    const { items } = fallbackCuration(many);
    expect(items.filter((i) => i.section === "newsroom")).toHaveLength(5);
    expect(items.filter((i) => i.section === "repos")).toHaveLength(5);
  });

  it("PRD-curator: carries metrics and returning from the candidate", () => {
    const { items } = fallbackCuration([candidates[1]]);
    expect(items[0]).toMatchObject({ metrics: { stars: 1200 }, returning: true });
  });
});

describe("buildPrompt / SYSTEM_PROMPT", () => {
  it("PRD-curator: one id|source|section|title|snippet line per item, snippet cut at 200", () => {
    const long = raw("L1", { snippet: "x".repeat(500) });
    const lines = buildPrompt([candidates[0], long], []).split("\n");
    expect(lines).toContain("a1|TechCrunch|newsroom|Title a1|Snippet a1");
    const line = lines.find((l) => l.startsWith("L1|"))!;
    expect(line.split("|")[4]).toBe("x".repeat(200));
  });

  it("PRD-curator: pipes and newlines inside fields cannot break the line format", () => {
    const line = buildPrompt([raw("p1", { title: "A | B", snippet: "c\nd" })], []).split("\n").find((l) => l.startsWith("p1|"))!;
    expect(line.split("|")).toHaveLength(5);
  });

  it("PRD-curator: includes stars for repos so 'why trending' can be written from data", () => {
    expect(buildPrompt([candidates[1]], [])).toMatch(/b2\|GitHub\|repos\|Title b2\|Snippet b2.*1200/);
  });

  it("PRD-curator: lists recent headlines for exclusion", () => {
    const p = buildPrompt([candidates[0]], ["지난 판 헤드라인 A", "지난 판 헤드라인 B"]);
    expect(p).toContain("- 지난 판 헤드라인 A");
    expect(p).toContain("- 지난 판 헤드라인 B");
  });

  it("PRD-curator: system prompt names every section, region, industry and demands JSON only", () => {
    for (const k of ["repos", "pulse", "newsroom", "ax", "playbook", "KR", "GLOBAL", "construction", "media", "front", "takeaway"])
      expect(SYSTEM_PROMPT).toContain(k);
    expect(SYSTEM_PROMPT).toMatch(/JSON/);
  });
});

describe("curate", () => {
  const errSpy = () => vi.spyOn(console, "error").mockImplementation(() => {});
  afterEach(() => vi.restoreAllMocks());

  it("PRD-curator: valid response gives curated:true", async () => {
    const res = await curate(candidates, [], async () => json([entry("a1"), entry("b2"), entry("c3")]));
    expect(res.curated).toBe(true);
    expect(res.items).toHaveLength(3);
  });

  it("PRD-curator: a throwing run falls back with curated:false", async () => {
    const spy = errSpy();
    const res = await curate(candidates, [], async () => { throw new Error("boom"); });
    expect(res.curated).toBe(false);
    expect(res.items.length).toBeGreaterThan(0);
    expect(spy).toHaveBeenCalled();
  });

  it("PRD-curator: unparseable output falls back with curated:false", async () => {
    errSpy();
    const res = await curate(candidates, [], async () => "sorry, no JSON today");
    expect(res.curated).toBe(false);
    expect(res.items[0].title.ko).toBe(res.items[0].title.en);
  });

  it("PRD-curator: the prompt handed to run contains the candidates and recent headlines", async () => {
    let seen = "";
    await curate(candidates, ["어제의 헤드라인"], async (p) => { seen = p; return json([entry("a1")]); });
    expect(seen).toContain("a1|TechCrunch|newsroom");
    expect(seen).toContain("어제의 헤드라인");
  });
});

describe("runClaude (fake CLI on PATH, the real claude is never invoked)", () => {
  const origPath = process.env.PATH;
  afterEach(() => { process.env.PATH = origPath; });

  /** Installs a fake `claude` executable first on PATH; `body(dir)` is its sh script. */
  function fakeClaude(body: (dir: string) => string) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fake-claude-"));
    fs.writeFileSync(path.join(dir, "claude"), `#!/bin/sh\n${body(dir)}\n`, { mode: 0o755 });
    process.env.PATH = `${dir}:${origPath}`;
    return dir;
  }

  it("PRD-curator: passes the documented flags, feeds the prompt via stdin, returns envelope.result", async () => {
    const dir = fakeClaude(
      (d) => `printf '%s\\0' "$@" > "${d}/args"\ncat > "${d}/stdin"\nprintf '%s' '{"type":"result","is_error":false,"result":"{\\"ok\\":1}"}'`,
    );
    const out = await runClaude("hello prompt 한글", "sonnet");
    expect(out).toBe('{"ok":1}');
    expect(fs.readFileSync(path.join(dir, "stdin"), "utf8")).toBe("hello prompt 한글");
    expect(fs.readFileSync(path.join(dir, "args"), "utf8").split("\0").slice(0, -1)).toEqual([
      "-p", "--model", "sonnet", "--system-prompt", SYSTEM_PROMPT,
      "--tools", "", "--strict-mcp-config", "--no-session-persistence", "--output-format", "json",
    ]);
  });

  it("PRD-curator: throws when the envelope says is_error", async () => {
    fakeClaude(() => `cat >/dev/null; printf '%s' '{"is_error":true,"result":"rate limited"}'`);
    await expect(runClaude("p", "sonnet")).rejects.toThrow(/rate limited/);
  });

  it("PRD-curator: throws on non-zero exit", async () => {
    fakeClaude(() => `cat >/dev/null; echo oops >&2; exit 3`);
    await expect(runClaude("p", "sonnet")).rejects.toThrow(/3/);
  });

  it("PRD-curator: throws on a non-JSON stdout", async () => {
    fakeClaude(() => `cat >/dev/null; echo not-json`);
    await expect(runClaude("p", "sonnet")).rejects.toThrow();
  });
});
