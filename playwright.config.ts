import { defineConfig, devices } from "@playwright/test";

const shouldStartServer = !process.env.CI || process.env.PLAYWRIGHT_START_SERVER === "true";

// Authenticated golden captures depend on storage state that the `setup`
// project produces through the real sign-in form (e2e/golden/auth.setup.ts).
// Browser projects ignore that file and declare the dependency instead.
const AUTH_SETUP = /auth\.setup\.ts$/;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "html",
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.01,
    },
  },
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: AUTH_SETUP,
    },
    {
      name: "chromium",
      // Pinned locale/timezone keep toLocaleDateString() output in the
      // authenticated baselines identical across runners.
      use: { ...devices["Desktop Chrome"], locale: "en-US", timezoneId: "UTC" },
      testIgnore: AUTH_SETUP,
      dependencies: ["setup"],
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
      testIgnore: AUTH_SETUP,
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
      testIgnore: AUTH_SETUP,
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
      testIgnore: AUTH_SETUP,
    },
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 13"] },
      testIgnore: AUTH_SETUP,
    },
  ],
  webServer: shouldStartServer
    ? {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      }
    : undefined,
});
