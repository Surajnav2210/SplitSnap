import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safeRedirect";

describe("safeNextPath", () => {
  it("keeps same-site paths", () => {
    expect(safeNextPath("/share")).toBe("/share");
    expect(safeNextPath("/b/abcdefghjkmn?x=1")).toBe("/b/abcdefghjkmn?x=1");
  });

  it("falls back for anything that could leave the site", () => {
    for (const bad of [null, undefined, "", "share", "https://evil.com", "//evil.com", "/\\evil.com", "/\tx", "javascript:alert(1)"]) {
      expect(safeNextPath(bad)).toBe("/share");
    }
    expect(safeNextPath("//x", "/")).toBe("/");
  });

  it("keeps a bill link as next, so a host can sign in from /b/<code>", () => {
    expect(safeNextPath("/b/abcdefghjkmn")).toBe("/b/abcdefghjkmn");
    expect(safeNextPath(new URLSearchParams(`next=${encodeURIComponent("/b/abcdefghjkmn")}`).get("next"))).toBe("/b/abcdefghjkmn");
  });
});
