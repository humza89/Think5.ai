import { describe, expect, it } from "vitest";
import { matchesRoutePrefix } from "@/lib/route-prefix";

describe("matchesRoutePrefix", () => {
  it("matches the exact path and deeper segments", () => {
    expect(matchesRoutePrefix("/interview", "/interview")).toBe(true);
    expect(matchesRoutePrefix("/interview/abc", "/interview")).toBe(true);
    expect(matchesRoutePrefix("/interview/accept", "/interview")).toBe(true);
    expect(matchesRoutePrefix("/candidate/dashboard", "/candidate")).toBe(true);
  });

  it("does not let a prefix swallow a sibling route that merely shares characters", () => {
    expect(matchesRoutePrefix("/interviews", "/interview")).toBe(false);
    expect(matchesRoutePrefix("/interviews/templates", "/interview")).toBe(false);
    expect(matchesRoutePrefix("/candidates", "/candidate")).toBe(false);
    expect(matchesRoutePrefix("/candidates/abc/notes", "/candidate")).toBe(false);
  });

  it("treats prefixes ending in a slash as directory prefixes", () => {
    expect(matchesRoutePrefix("/api/auth/signin", "/api/auth/")).toBe(true);
    expect(matchesRoutePrefix("/_next/static/chunk.js", "/_next/")).toBe(true);
    expect(matchesRoutePrefix("/api/authz", "/api/auth/")).toBe(false);
  });
});
