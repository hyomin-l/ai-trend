import { describe, expect, it } from "vitest";
import { kstStamp, relTime } from "@/lib/format";

const REF = "2026-10-13T05:00:00Z"; // 14:00 KST
const ago = (min: number) => new Date(Date.parse(REF) - min * 60_000).toISOString();

describe("relTime", () => {
  it("is relative under 24h", () => {
    expect(relTime(ago(0), REF, "ko")).toBe("방금");
    expect(relTime(ago(59), REF, "ko")).toBe("59분 전");
    expect(relTime(ago(23 * 60), REF, "ko")).toBe("23시간 전");
    expect(relTime(ago(23 * 60 + 59), REF, "en")).toBe("23h ago");
    expect(relTime(ago(0), REF, "en")).toBe("just now");
    expect(relTime(ago(59), REF, "en")).toBe("59m ago");
  });
  it("is a date from 24h on", () => {
    expect(relTime(ago(24 * 60), REF, "ko")).toBe("10월 12일");
    expect(relTime(ago(24 * 60), REF, "en")).toBe("Oct 12");
    expect(relTime(ago(3 * 24 * 60), REF, "ko")).toBe("10월 10일");
    expect(relTime(ago(3 * 24 * 60), REF, "en")).toBe("Oct 10");
  });
  it("adds the year when it differs from the edition's", () => {
    const ref = "2026-01-02T05:00:00Z";
    expect(relTime("2025-12-20T10:00:00Z", ref, "ko")).toBe("2025년 12월 20일");
    expect(relTime("2025-12-20T10:00:00Z", ref, "en")).toBe("Dec 20, 2025");
  });
  it("uses the KST calendar day", () => {
    // 2026-10-10T16:00Z is already Oct 11 in Seoul
    expect(relTime("2026-10-10T16:00:00Z", REF, "ko")).toBe("10월 11일");
  });
  it("returns empty for bad input", () => {
    expect(relTime("nope", REF, "ko")).toBe("");
  });
});

describe("kstStamp", () => {
  it("formats the exact KST time", () => {
    expect(kstStamp("2026-10-13T05:05:00Z")).toBe("2026-10-13 14:05 KST");
  });
});
