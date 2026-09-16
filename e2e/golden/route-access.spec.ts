import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

type PageEntry = {
  route: string;
  public: boolean;
  roles: string[];
  dynamic: boolean;
};

const manifest = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "docs/preservation/manifest.json"), "utf8"),
) as { pages: PageEntry[] };

const fixtures = (() => {
  try {
    return JSON.parse(process.env.ROUTE_MATRIX_FIXTURES || "{}") as Record<string, string>;
  } catch {
    throw new Error("ROUTE_MATRIX_FIXTURES must be valid JSON");
  }
})();

const resolved = (entry: PageEntry) => (entry.dynamic ? fixtures[entry.route] : entry.route);
const publicPages = manifest.pages.filter((p) => p.public && resolved(p));
const protectedPages = manifest.pages.filter((p) => !p.public && p.roles.length > 0 && resolved(p));

test.describe("preservation route matrix", () => {
  for (const entry of publicPages) {
    test(`public ${entry.route} stays reachable logged out`, async ({ page }) => {
      const response = await page.goto(resolved(entry)!);
      expect(response?.status(), `${entry.route} should return 200`).toBe(200);
    });
  }

  for (const entry of protectedPages) {
    test(`protected ${entry.route} redirects logged-out users`, async ({ page }) => {
      await page.goto(resolved(entry)!);
      await expect(page).toHaveURL(/\/auth\/signin(?:\?|$)/);
      expect(new URL(page.url()).searchParams.get("redirectTo")).toBe(resolved(entry));
    });
  }
});
