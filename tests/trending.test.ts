import { describe, expect, it } from "vitest";
import { AI_REPO_KEYWORDS } from "@/config/sources";
import { parseTrending } from "@/lib/trending";

describe("parseTrending", () => {
  it("skips articles without a weekly gain and returns [] for unrelated HTML", () => {
    expect(parseTrending("<html>nothing</html>")).toEqual([]);
    expect(parseTrending('<article><h2><a href="/a/b">x</a></h2><p>d</p></article>')).toEqual([]);
  });
});

describe("AI_REPO_KEYWORDS", () => {
  it.each(["An LLM agent runtime", "MCP server for Postgres", "RAG pipeline", "Skills for agents", "Claude Code plugins", "Stable diffusion UI"])(
    "matches %s", (t) => expect(AI_REPO_KEYWORDS.test(t)).toBe(true));
  it.each(["Tool for porting PS5 executables", "A fast Rust web framework", "Paint app", "Maintain docs"])(
    "does not match %s", (t) => expect(AI_REPO_KEYWORDS.test(t)).toBe(false));
});
