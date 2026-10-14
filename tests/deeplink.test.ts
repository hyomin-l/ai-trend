import { describe, expect, it } from "vitest";
import { openParam, withoutOpen } from "@/lib/deeplink";

describe("deeplink", () => {
  it("reads and decodes the open param", () => {
    expect(openParam("?open=hn%3A123")).toBe("hn:123");
    expect(openParam("?x=1")).toBeNull();
    expect(openParam("?open=")).toBeNull();
    expect(openParam("")).toBeNull();
  });
  it("drops only open", () => {
    expect(withoutOpen("?open=a")).toBe("");
    expect(withoutOpen("?x=1&open=a")).toBe("?x=1");
  });
});
