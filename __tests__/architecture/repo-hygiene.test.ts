/** T13: scratch files stay out, legacy material lives under docs/legacy, vendored relay deps are not committed. */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("repository hygiene (T13)", () => {
  it("has no scratch test files at the repository root", () => {
    const stray = readdirSync(".").filter((f) => /^test-.*\.(js|mjs|ts)$/.test(f));
    expect(stray).toEqual([]);
  });

  it("keeps legacy material under docs/legacy", () => {
    expect(existsSync("Ai-Interview")).toBe(false);
    expect(existsSync("Project-info")).toBe(false);
    expect(existsSync("docs/legacy/Ai-Interview")).toBe(true);
    expect(existsSync("docs/legacy/Project-info")).toBe(true);
  });

  it("does not track relay/node_modules and ignores it", () => {
    expect(readFileSync("relay/.gitignore", "utf8")).toMatch(/node_modules/);
    let tracked = "";
    try {
      tracked = execSync("git ls-files relay/node_modules", { encoding: "utf8" });
    } catch {
      tracked = "";
    }
    expect(tracked.trim()).toBe("");
  });

  it("never logs the interview setup payload", () => {
    const hook = readFileSync("hooks/useVoiceInterview.ts", "utf8");
    expect(hook).not.toMatch(/console\.log\("\[Voice\] Setup message"/);
    expect(hook).not.toMatch(/console\.(log|debug|info)\([^)]*JSON\.stringify\(setupMsg\)/);
    const voiceInit = readFileSync("app/api/interviews/[id]/voice-init/route.ts", "utf8");
    expect(voiceInit).not.toMatch(/console\.log\(`\[voice-init\] SUCCESS/);
  });

  it("README documents the services and scripts", () => {
    const readme = readFileSync("README.md", "utf8");
    for (const s of ["Vercel", "Supabase", "Upstash", "Inngest", "Fly.io", "R2", "manifest:check", "test:e2e:golden"]) expect(readme).toContain(s);
  });
});
