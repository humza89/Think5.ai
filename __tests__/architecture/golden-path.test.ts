/**
 * T14 golden path prerequisites: the mock provider is selectable per stage,
 * the mock interviewer/scorer are deterministic, and the proxy lets Inngest
 * reach /api/inngest (a durable function can never run behind a CSRF check).
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProviderForStage, getProviderForStage } from "@/lib/ai-providers/interface";
import { buildMockInterviewReport, isMockInterviewing, isMockScoring, mockInterviewerReply } from "@/lib/ai-providers/mock-interview";

afterEach(() => vi.unstubAllEnvs());

describe("golden path (T14)", () => {
  it("selects the mock provider per stage without touching the default", async () => {
    vi.stubEnv("AI_PROVIDER", "");
    vi.stubEnv("AI_PROVIDER_SCORING", "mock");
    expect(getProviderForStage("scoring")).toBe("mock");
    expect(getProviderForStage("interviewing")).toBe("gemini");
    expect(isMockScoring()).toBe(true);
    expect(isMockInterviewing()).toBe(false);
    const provider = await createProviderForStage("scoring");
    expect(provider.name).toBe("mock");
    vi.stubEnv("AI_PROVIDER", "mock");
    expect(isMockInterviewing()).toBe(true);
  });

  it("mock interviewer asks a fixed sequence and wraps up", () => {
    const first = mockInterviewerReply([], "Please begin the interview.");
    expect(first).toMatch(/^Hi, I'm Aria\./);
    const history = [{ role: "interviewer", content: first }, { role: "candidate", content: "short" }];
    const second = mockInterviewerReply(history, "short");
    expect(second).toMatch(/trade-off/);
    expect(mockInterviewerReply(history, "short")).toBe(second); // deterministic
    const many = Array.from({ length: 6 }, (_, i) => ({ role: i % 2 ? "candidate" : "interviewer", content: `t${i}` }));
    expect(mockInterviewerReply([...many, ...many], "x")).toMatch(/wrap up/);
  });

  it("mock scorer produces a complete report shape with transcript-linked evidence", () => {
    const transcript = [
      { role: "interviewer", content: "Q1" },
      { role: "candidate", content: "I led the migration of our order pipeline and owned the rollout. ".repeat(3) },
      { role: "interviewer", content: "Q2" },
      { role: "candidate", content: "We chose idempotent consumers; the cost was a dedup table." },
    ];
    const report = buildMockInterviewReport(transcript, { fullName: "Jordan Alvarez", currentTitle: "Engineer", skills: ["Go", "Postgres"] });
    expect(report.technicalSkills.map((s) => s.skill)).toEqual(["Go", "Postgres"]);
    expect(report.overallScore).toBeGreaterThanOrEqual(40);
    expect(["YES", "MAYBE", "NO"]).toContain(report.recommendation);
    expect(report.summary).toContain("Jordan Alvarez");
    expect(report.evidenceHighlights[0]).toMatchObject({ type: "strength", transcriptRange: { startIdx: 1, endIdx: 1 } });
    expect(buildMockInterviewReport(transcript, { fullName: "Jordan Alvarez" })).toEqual(buildMockInterviewReport(transcript, { fullName: "Jordan Alvarez" }));
  });

  it("proxy exempts /api/inngest from CSRF so Inngest can invoke functions", () => {
    const proxy = readFileSync("proxy.ts", "utf8");
    expect(proxy).toMatch(/\/\^\\\/api\\\/inngest\$\//);
    expect(proxy).toContain("'/api/inngest',"); // reachable without a session too
  });
});
