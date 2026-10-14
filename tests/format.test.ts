import { describe, expect, it } from "vitest";
import { fmtWhen, kstStamp } from "@/lib/format";

const REF = "2026-10-13T05:00:00Z"; // 14:00 KST

describe("fmtWhen", () => {
  it("is always absolute KST, 24h clock", () => {
    expect(fmtWhen("2026-10-13T05:05:00Z", REF, "ko")).toBe("10월 13일 14:05");
    expect(fmtWhen("2026-10-13T05:05:00Z", REF, "en")).toBe("Oct 13, 14:05");
    expect(fmtWhen("2026-10-12T15:30:00Z", REF, "ko")).toBe("10월 13일 00:30");
    expect(fmtWhen("2026-10-10T01:00:00Z", REF, "en")).toBe("Oct 10, 10:00");
  });
  it("adds the year when it differs from the edition's", () => {
    const ref = "2026-01-02T05:00:00Z";
    expect(fmtWhen("2025-12-20T10:00:00Z", ref, "ko")).toBe("2025년 12월 20일 19:00");
    expect(fmtWhen("2025-12-20T10:00:00Z", ref, "en")).toBe("Dec 20, 2025, 19:00");
  });
  it("dateOnly drops the clock (repo creation)", () => {
    expect(fmtWhen("2026-10-03T16:00:00Z", REF, "ko", true)).toBe("10월 4일");
    expect(fmtWhen("2026-10-03T16:00:00Z", REF, "en", true)).toBe("Oct 4");
    expect(fmtWhen("2025-10-03T16:00:00Z", REF, "en", true)).toBe("Oct 4, 2025");
  });
  it("returns empty for bad input", () => {
    expect(fmtWhen("nope", REF, "ko")).toBe("");
  });
});

describe("kstStamp", () => {
  it("formats the exact KST time", () => {
    expect(kstStamp("2026-10-13T05:05:00Z")).toBe("2026-10-13 14:05 KST");
  });
});
