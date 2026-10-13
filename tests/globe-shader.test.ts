import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// components/Globe.tsx rewrites this exact string in cobe's fragment shader; a cobe upgrade that changes it must fail here.
describe("cobe shader", () => {
  it("still contains the dot mask that Globe.tsx widens", () => {
    const src = readFileSync("node_modules/cobe/dist/index.esm.js", "utf8");
    expect(src.split("smoothstep(8e-3,0.,g)")).toHaveLength(2);
  });
});
