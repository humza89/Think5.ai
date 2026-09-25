import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirstCandidate = vi.fn();
const findFirstInterview = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    candidate: { findFirst: (...args: unknown[]) => findFirstCandidate(...args) },
    interview: { findFirst: (...args: unknown[]) => findFirstInterview(...args) },
  },
}));

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    getAuthenticatedUser: vi.fn(async () => ({
      user: { id: "user-1" },
      profile: { role: "candidate", email: "Jordan@Example.test" },
    })),
  };
});

import { GET } from "@/app/api/candidate/interviews/[id]/report/route";

const report = {
  overallScore: 88,
  recommendation: "HIRE",
  summary: "Strong systems thinker.",
  strengths: ["Depth"],
  areasToImprove: ["Brevity"],
  headline: "Senior-ready",
  reviewStatus: "REVIEWED",
};

function call(id = "int-1") {
  return GET(new Request(`http://localhost/api/candidate/interviews/${id}/report`) as never, { params: Promise.resolve({ id }) });
}

describe("GET /api/candidate/interviews/[id]/report ownership", () => {
  beforeEach(() => {
    findFirstCandidate.mockReset();
    findFirstInterview.mockReset();
  });

  it("finds the interview by the candidate record even when invitedEmail differs", async () => {
    findFirstCandidate.mockResolvedValue({ id: "cand-1" });
    findFirstInterview.mockResolvedValue({
      id: "int-1",
      type: "TECHNICAL",
      createdAt: new Date("2026-09-01T09:00:00Z"),
      invitedEmail: "someone-else@example.test",
      transcript: null,
      templateSnapshot: null,
      candidate: { fullName: "Jordan Alvarez", currentTitle: "Engineer" },
      report,
    });

    const response = await call();
    expect(response.status).toBe(200);

    const where = findFirstInterview.mock.calls[0][0].where;
    expect(where.id).toBe("int-1");
    expect(where.OR[0]).toEqual({ candidateId: "cand-1" });
    expect(where.OR[1]).toEqual({ invitedEmail: { equals: "Jordan@Example.test", mode: "insensitive" } });

    const body = await response.json();
    // Default policy: strengths shown, scores and improvement areas hidden.
    expect(body.report.strengths).toEqual(["Depth"]);
    expect(body.report.overallScore).toBeNull();
    expect(body.report.areasToImprove).toBeNull();
    expect(body.report.hiringAdvice).toBeNull();
    expect(body.candidateName).toBe("Jordan Alvarez");
  });

  it("falls back to invitedEmail when no candidate record exists", async () => {
    findFirstCandidate.mockResolvedValue(null);
    findFirstInterview.mockResolvedValue(null);
    const response = await call();
    expect(response.status).toBe(404);
    const where = findFirstInterview.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ invitedEmail: { equals: "Jordan@Example.test", mode: "insensitive" } }]);
  });

  it("honours a snapshot policy that reveals scores", async () => {
    findFirstCandidate.mockResolvedValue({ id: "cand-1" });
    findFirstInterview.mockResolvedValue({
      id: "int-1",
      type: "TECHNICAL",
      createdAt: new Date("2026-09-01T09:00:00Z"),
      invitedEmail: null,
      transcript: null,
      templateSnapshot: { candidateReportPolicy: { showScores: true, showAreasToImprove: true } },
      candidate: { fullName: "Jordan Alvarez", currentTitle: null },
      report,
    });
    const body = await (await call()).json();
    expect(body.report.overallScore).toBe(88);
    expect(body.report.areasToImprove).toEqual(["Brevity"]);
    expect(body.report.integrityScore).toBeNull();
  });
});
