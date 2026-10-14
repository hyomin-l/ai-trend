import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { listDates, loadSnapshot, snapshotDir, validateSnapshot } from "@/lib/snapshots";

describe("committed snapshots", () => {
  const dates = listDates();
  it("exist", () => expect(dates.length).toBeGreaterThan(0));
  for (const d of dates) {
    it(`${d} is valid`, () => {
      const raw = JSON.parse(fs.readFileSync(path.join(snapshotDir(), `${d}.json`), "utf8"));
      expect(validateSnapshot(raw, d)).toEqual([]);
    });
  }
});

describe("validateSnapshot", () => {
  const base = () => structuredClone(loadSnapshot(listDates()[0])!) as any;
  const date = () => base().date as string;
  const errs = (mut: (s: any) => void) => { const s = base(); mut(s); return validateSnapshot(s, date()).join("\n"); };

  it("accepts a good snapshot", () => expect(validateSnapshot(base(), date())).toEqual([]));
  it("accepts a valid related list and rejects bad ones", () => {
    expect(errs((s) => { s.items[0].related = [{ source: "Other", url: "https://example.com/x" }]; })).toBe("");
    expect(errs((s) => { s.items[0].related = "x"; })).toContain("related must be an array");
    expect(errs((s) => { s.items[0].related = [{ source: "Other", url: "javascript:alert(1)" }]; })).toContain("related #0");
    expect(errs((s) => { s.items[0].related = [{ source: " ", url: "https://example.com/x" }]; })).toContain("related #0");
  });
  it("rejects javascript: urls", () => expect(errs((s) => { s.items[0].url = "javascript:alert(1)"; })).toContain(`item ${base().items[0].id}: url`));
  it("rejects a missing field", () => expect(errs((s) => { delete s.items[0].takeaway; })).toContain("takeaway"));
  it("rejects empty translations", () => expect(errs((s) => { s.items[0].title.en = " "; })).toContain("title"));
  it("rejects unknown section and region", () => {
    const e = errs((s) => { s.items[0].section = "nope"; s.items[0].region = "MARS"; });
    expect(e).toContain("unknown section");
    expect(e).toContain("unknown region");
  });
  it("rejects duplicate ids", () => expect(errs((s) => { s.items[1].id = s.items[0].id; })).toContain("duplicate id"));
  it("rejects front ids not in items", () => expect(errs((s) => { s.front.push("ghost"); })).toContain('front id "ghost"'));
  it("rejects a wrong date", () => expect(validateSnapshot(base(), "2000-01-01").join()).toContain("does not match filename"));
  it.each([1.6e297, 1e9, -1, NaN, Infinity])("rejects metric %s", (v) =>
    expect(errs((s) => { s.items[0].metrics = { stars: v }; })).toContain("metrics.stars out of range"));
  it("accepts sane metrics", () => expect(errs((s) => { s.items[0].metrics = { stars: 183758, language: "TS" }; })).toBe(""));
  it("rejects a bad issue", () => expect(errs((s) => { s.issue = 0; })).toContain("issue"));
  it("rejects a malformed glossary", () => expect(errs((s) => { s.glossary = [{ term: "", desc: { ko: "a" } }]; })).toContain("glossary #0"));
});
