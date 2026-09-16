import { test, expect } from "@playwright/test";

const publicTargets = [
  { name: "home", route: "/" },
  { name: "signin", route: "/auth/signin" },
  { name: "product", route: "/product" },
  { name: "recruitment", route: "/recruitment" },
  { name: "ai-training", route: "/ai-training" },
] as const;

for (const target of publicTargets) {
  test(`visual public ${target.name}`, async ({ page }) => {
    await page.goto(target.route, { waitUntil: "networkidle" });
    await expect(page).toHaveScreenshot(`${target.name}.png`, {
      fullPage: true,
      animations: "disabled",
      caret: "hide",
    });
  });
}

const recruiterStorage = process.env.E2E_RECRUITER_STORAGE_STATE;
const candidateStorage = process.env.E2E_CANDIDATE_STORAGE_STATE;

test("visual recruiter command surfaces", async ({ browser }) => {
  test.skip(!recruiterStorage, "Authenticated visual baseline requires E2E_RECRUITER_STORAGE_STATE");
  const context = await browser.newContext({ storageState: recruiterStorage });
  const page = await context.newPage();

  for (const [name, route] of [
    ["dashboard", "/dashboard"],
    ["jobs", "/jobs"],
    ["candidates", "/candidates"],
    ["interviews", "/interviews"],
  ] as const) {
    await page.goto(route, { waitUntil: "networkidle" });
    await expect(page).toHaveScreenshot(`${name}.png`, {
      fullPage: true,
      animations: "disabled",
      caret: "hide",
    });
  }

  await context.close();
});

test("visual candidate dashboard", async ({ browser }) => {
  test.skip(!candidateStorage, "Authenticated visual baseline requires E2E_CANDIDATE_STORAGE_STATE");
  const context = await browser.newContext({ storageState: candidateStorage });
  const page = await context.newPage();
  await page.goto("/candidate/dashboard", { waitUntil: "networkidle" });
  await expect(page).toHaveScreenshot("candidate-dashboard.png", {
    fullPage: true,
    animations: "disabled",
    caret: "hide",
  });
  await context.close();
});
