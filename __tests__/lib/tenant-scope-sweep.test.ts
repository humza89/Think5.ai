/**
 * Track 1 tenant-scope sweep — regression guard.
 *
 * This test doesn't mount routes or mock Prisma; it's a source-level
 * invariant check that every route in the migrated set uses
 * buildInterviewAccessScope (the scoped helper) rather than the legacy
 * requireInterviewAccess two-query pattern. The point is to stop a
 * future refactor from silently reintroducing the IDOR path the
 * original PR closed.
 *
 * New migrations should be added to MIGRATED_ROUTES. If you intentionally
 * revert one, remove it from the list — the test will start failing.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const repoRoot = resolve(__dirname, "../..");

const MIGRATED_ROUTES = [
  // Track 1 original migration (PR #4)
  "app/api/interviews/[id]/route.ts",
  // Tenant-scope sweep (this PR)
  "app/api/interviews/[id]/report/route.ts",
  "app/api/interviews/[id]/report/pdf/route.ts",
  "app/api/interviews/[id]/report/verify/route.ts",
  "app/api/interviews/[id]/report/review/route.ts",
  "app/api/interviews/[id]/report/share/route.ts",
  "app/api/interviews/[id]/report/share/revoke/route.ts",
  "app/api/interviews/[id]/evidence-bundle/route.ts",
];

describe("Tenant-scope sweep — source-level invariants", () => {
  for (const path of MIGRATED_ROUTES) {
    it(`${path} imports buildInterviewAccessScope`, () => {
      const src = readFileSync(resolve(repoRoot, path), "utf8");
      expect(src).toMatch(/buildInterviewAccessScope/);
    });

    it(`${path} calls buildInterviewAccessScope at runtime (not just imports it)`, () => {
      const src = readFileSync(resolve(repoRoot, path), "utf8");
      // At least one actual invocation — guards against the mistake of
      // importing the symbol but forgetting to call it.
      expect(src).toMatch(/buildInterviewAccessScope\s*\(/);
    });

    it(`${path} includes at least one findFirst scoped by whereFragment`, () => {
      const src = readFileSync(resolve(repoRoot, path), "utf8");
      // We require the sweep to USE the fragment, not just resolve it.
      // A migrated route should feed the scope into a findFirst or
      // updateMany call. Exact call site varies but the token
      // `whereFragment` or `scope.whereFragment` should appear.
      expect(src).toMatch(/whereFragment/);
    });
  }

  it("inventory is not empty — smoke check that the test file itself is wired", () => {
    expect(MIGRATED_ROUTES.length).toBeGreaterThan(0);
  });
});
