import fs from "node:fs";
import { test, expect, Page } from "@playwright/test";
import { E2E_FIXTURES, STORAGE_STATE_PATHS } from "../fixtures/e2e-fixtures";

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

async function suppressRunnerChrome(page: Page) {
  // Viewport changes can cause Next devtools to mount after settleVisuals().
  // Install a persistent host-level rule immediately before each capture so
  // late/re-mounted portals remain excluded for the entire screenshot wait.
  await page.evaluate(() => {
    const id = "__think5-golden-runner-chrome";
    if (!document.getElementById(id)) {
      const style = document.createElement("style");
      style.id = id;
      style.textContent = "nextjs-portal { display: none !important; visibility: hidden !important; }";
      (document.head ?? document.documentElement).appendChild(style);
    }
    for (const portal of Array.from(document.querySelectorAll("nextjs-portal"))) {
      const element = portal as HTMLElement;
      element.style.setProperty("display", "none", "important");
      element.style.setProperty("visibility", "hidden", "important");
    }
  });
}

async function captureBoth(page: Page, name: string) {
  await settleVisuals(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await suppressRunnerChrome(page);
  // Soft screenshot assertions still fail the test, but let CI capture the
  // second viewport (and later surfaces) so a single run produces complete
  // regression evidence instead of stopping at the first mismatch.
  await expect.soft(page).toHaveScreenshot(`${name}-1280.png`, {
    fullPage: true,
    animations: "disabled",
    caret: "hide",
  });

  await page.setViewportSize({ width: 375, height: 812 });
  await suppressRunnerChrome(page);
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

/**
 * Authenticated surfaces use storage state produced by e2e/golden/auth.setup.ts
 * through the real sign-in form. An explicit env path wins; otherwise the
 * setup project's default output is used when present. When CI declares
 * E2E_AUTH_FIXTURES=true a missing file is a failure, never a silent skip.
 */
const fixturesRequired = process.env.E2E_AUTH_FIXTURES === "true";

function storageStateFor(envName: string, fallback: string): string | undefined {
  const explicit = process.env[envName];
  if (explicit) return explicit;
  return fs.existsSync(fallback) ? fallback : undefined;
}

const recruiterStorage = storageStateFor("E2E_RECRUITER_STORAGE_STATE", STORAGE_STATE_PATHS.recruiter);
const candidateStorage = storageStateFor("E2E_CANDIDATE_STORAGE_STATE", STORAGE_STATE_PATHS.candidate);

function requireStorage(kind: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`E2E_AUTH_FIXTURES=true but no ${kind} storage state was generated by the setup project`);
  }
  if (!fs.existsSync(value)) {
    throw new Error(`${kind} storage state ${value} does not exist`);
  }
  return value;
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function waitForAuthenticatedShell(page: Page, route: string) {
  // ProtectedRoute + DashboardLayout render "Loading..." until the Supabase
  // session, profile and onboarding checks resolve; a capture before that
  // would baseline the spinner. The URL check proves no guard redirected us.
  await expect(page.getByText("Loading...", { exact: true })).toHaveCount(0, { timeout: 30_000 });
  await expect(page).toHaveURL(new RegExp(`${escapeRegExp(route)}(?:\\?|$)`));
}

test("visual recruiter command surfaces", async ({ browser }) => {
  test.skip(!fixturesRequired && !recruiterStorage, "Authenticated visual baseline requires E2E_RECRUITER_STORAGE_STATE");
  const context = await browser.newContext({ storageState: requireStorage("recruiter", recruiterStorage) });
  const page = await context.newPage();
  await prepareDeterministicPage(page);

  for (const [name, route] of [
    ["dashboard", "/dashboard"],
    ["jobs", "/jobs"],
    ["job-detail", E2E_FIXTURES.routes.jobDetail],
    ["candidates", "/candidates"],
    ["interviews", "/interviews"],
  ] as const) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await waitForAuthenticatedShell(page, route);
    await captureBoth(page, name);
  }

  await context.close();
});

test("visual candidate surfaces", async ({ browser }) => {
  test.skip(!fixturesRequired && !candidateStorage, "Authenticated visual baseline requires E2E_CANDIDATE_STORAGE_STATE");
  const context = await browser.newContext({ storageState: requireStorage("candidate", candidateStorage) });
  const page = await context.newPage();
  await prepareDeterministicPage(page);

  await page.goto("/candidate/dashboard", { waitUntil: "domcontentloaded" });
  await waitForAuthenticatedShell(page, "/candidate/dashboard");
  await captureBoth(page, "candidate-dashboard");

  // Interview room at the welcome stage: the HttpOnly interview-session cookie
  // captured during setup authorises /api/interviews/[id]/validate.
  await page.goto(E2E_FIXTURES.routes.interviewWelcome, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(`Welcome, ${E2E_FIXTURES.candidate.fullName}`)).toBeVisible({ timeout: 30_000 });
  await captureBoth(page, "interview-welcome");

  await context.close();
});
