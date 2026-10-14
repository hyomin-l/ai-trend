import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { SECTIONS } from "@/config/sections";
import { buildLatest } from "@/lib/latest";
import { latestSnapshot } from "@/lib/snapshots";

describe("latest.json", () => {
  const l = buildLatest(latestSnapshot()) as any;
  it("keeps the edition fields", () => {
    expect(l.date).toBeTruthy();
    expect(Array.isArray(l.items)).toBe(true);
    expect(Array.isArray(l.front)).toBe(true);
  });
  it("labels every section from SECTIONS", () => {
    expect(Object.keys(l.sections)).toEqual(Object.keys(SECTIONS));
    for (const [k, s] of Object.entries(SECTIONS)) expect(l.sections[k]).toEqual({ ko: s.ko, en: s.en });
  });
  it("carries the pet version from desk-pet/VERSION", () => {
    const v = fs.readFileSync("desk-pet/VERSION", "utf8").trim();
    expect(v).toMatch(/^\d+\.\d+\.\d+$/);
    expect(l.pet.version).toBe(v);
    expect(l.pet.update).toContain("./install.sh");
  });
  it("still has pet and sections without an edition", () => {
    const e = buildLatest(null) as any;
    expect(e.date).toBeUndefined();
    expect(e.pet.version).toBe(l.pet.version);
  });
});
