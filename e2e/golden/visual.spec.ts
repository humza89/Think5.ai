import { test, expect, Page } from "@playwright/test";

/**
 * Must run BEFORE navigation: components read prefers-reduced-motion at
 * mount (count-up numbers, rotating feeds), so emulating it afterwards
 * leaves JS-driven motion running and makes captures non-deterministic.
 */
async function prepareDeterministicPage(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
}

async function settleVisuals(page: Page) {
  // Remote images (portraits, camera thumbnails) load after domcontentloaded;
  // capture only once the network is idle and every image has settled.
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images).map((img) =>
        img.complete ? null : new Promise<void>((r) => { img.onload = () => r(); img.onerror = () => r(); }),
      ),
    );
    // Scroll-reveal sections start at opacity 0 and only animate in when
    // scrolled into view, which a full-page capture never does.
    for (const el of Array.from(document.querySelectorAll(".reveal"))) {
      el.classList.add("is-visible");
    }
    // Next.js devtools are runner chrome, not Think5 product UI. Keeping the
    // portal in a golden image would preserve framework state (for example
    // "N" or "1 Issue") instead of the application surface under test.
    for (const portal of Array.from(document.querySelectorAll("nextjs-portal"))) {
      portal.remove();
    }
    // Footage frames are not code under test and decode non-deterministically.
    for (const video of Array.from(document.querySelectorAll("video"))) {
      (video as HTMLElement).style.visibility = "hidden";
    }
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
  // Soft screenshot assertions still fail the test, but let CI capture the
  // second viewport (and later surfaces) so a single run produces complete
  // regression evidence instead of stopping at the first mismatch.
  await expect.soft(page).toHaveScreenshot(`${name}-1280.png`, {
    fullPage: true,
    animations: "disabled",
    caret: "hide",
  });

  await page.setViewportSize({ width: 375, height: 812 });
  await expect.soft(page).toHaveScreenshot(`${name}-375.png`, {
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
    await prepareDeterministicPage(page);
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
  await prepareDeterministicPage(page);

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
  await prepareDeterministicPage(page);
  await page.goto("/candidate/dashboard", { waitUntil: "domcontentloaded" });
  await captureBoth(page, "candidate-dashboard");
  await context.close();
});
