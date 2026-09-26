/**
 * Tenant-scope sweep — source-level regression guard.
 *
 * Every route in MIGRATED_ROUTES must resolve access through
 * buildInterviewAccessScope and feed its whereFragment into the Prisma query,
 * instead of the legacy two-query pattern (requireInterviewAccess followed by
 * an unscoped findUnique). Salvaged from legacy PR #6.
 *
 * Add newly migrated routes here. Removing one deliberately reverts the
 * guard for that route and must be called out in review.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const repoRoot = resolve(__dirname, "../..");

const MIGRATED_ROUTES = [
  "app/api/interviews/[id]/route.ts",
  "app/api/interviews/[id]/report/route.ts",
  "app/api/interviews/[id]/report/pdf/route.ts",
  "app/api/interviews/[id]/report/verify/route.ts",
  "app/api/interviews/[id]/report/review/route.ts",
  "app/api/interviews/[id]/report/share/route.ts",
  "app/api/interviews/[id]/report/share/revoke/route.ts",
  "app/api/interviews/[id]/evidence-bundle/route.ts",
];

describe("tenant-scope sweep — source-level invariants", () => {
  for (const path of MIGRATED_ROUTES) {
    const src = () => readFileSync(resolve(repoRoot, path), "utf8");

    it(`${path} calls buildInterviewAccessScope`, () => {
      expect(src()).toMatch(/buildInterviewAccessScope\s*\(/);
    });

    it(`${path} feeds whereFragment into its queries`, () => {
      expect(src()).toMatch(/where:\s*scope\.whereFragment/);
    });

    it(`${path} no longer uses the legacy two-query pattern`, () => {
      const s = src();
      expect(s).not.toMatch(/requireInterviewAccess/);
      expect(s).not.toMatch(/prisma\.interview\.findUnique\(\s*\{\s*where:\s*\{\s*id\s*\}/);
    });
  }

  it("inventory is not empty", () => {
    expect(MIGRATED_ROUTES.length).toBeGreaterThan(0);
  });
});
