import { test, expect, Page } from "@playwright/test";

async function settleVisuals(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (const video of Array.from(document.querySelectorAll("video"))) {
      try {
        video.pause();
        video.currentTime = 0;
      } catch {
        // A cross-origin/media timing failure should not make the visual gate crash.
      }
    }
  });
}

async function captureBoth(page: Page, name: string) {
  await settleVisuals(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page).toHaveScreenshot(`${name}-1280.png`, {
    fullPage: true,
    animations: "disabled",
    caret: "hide",
  });

  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page).toHaveScreenshot(`${name}-375.png`, {
    fullPage: true,
    animations: "disabled",
    caret: "hide",
  });
}

const publicTargets = [
  { name: "home", route: "/" },
  { name: "signin", route: "/auth/signin" },
  { name: "product", route: "/product" },
  { name: "recruitment", route: "/recruitment" },
  { name: "ai-training", route: "/ai-training" },
] as const;

for (const target of publicTargets) {
  test(`visual public ${target.name}`, async ({ page }) => {
    await page.goto(target.route, { waitUntil: "domcontentloaded" });
    await captureBoth(page, target.name);
  });
}

const recruiterStorage = process.env.E2E_RECRUITER_STORAGE_STATE;
const candidateStorage = process.env.E2E_CANDIDATE_STORAGE_STATE;

test("visual recruiter command surfaces", async ({ browser }) => {
  test.skip(!recruiterStorage, "Authenticated visual baseline requires E2E_RECRUITER_STORAGE_STATE");
  const context = await browser.newContext({ storageState: recruiterStorage! });
  const page = await context.newPage();

  for (const [name, route] of [
    ["dashboard", "/dashboard"],
    ["jobs", "/jobs"],
    ["candidates", "/candidates"],
    ["interviews", "/interviews"],
  ] as const) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await captureBoth(page, name);
  }

  await context.close();
});

test("visual candidate dashboard", async ({ browser }) => {
  test.skip(!candidateStorage, "Authenticated visual baseline requires E2E_CANDIDATE_STORAGE_STATE");
  const context = await browser.newContext({ storageState: candidateStorage! });
  const page = await context.newPage();
  await page.goto("/candidate/dashboard", { waitUntil: "domcontentloaded" });
  await captureBoth(page, "candidate-dashboard");
  await context.close();
});
