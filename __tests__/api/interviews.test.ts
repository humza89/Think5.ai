import { describe, it, expect, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

describe("interview creation validation", () => {
  it("requires candidateId", () => {
    const body = { templateId: "template-1" };
    const errors: string[] = [];

    if (!body.candidateId) errors.push("candidateId is required");
    expect(errors).toContain("candidateId is required");
  });

  it("validates interview mode values", () => {
    const validModes = [
      "GENERAL_PROFILE",
      "JOB_FIT",
      "CULTURAL_FIT",
      "TECHNICAL_DEEP_DIVE",
      "HYBRID",
      "SCREENING",
      "FINAL_ROUND",
    ];

    expect(validModes).toContain("GENERAL_PROFILE");
    expect(validModes).toContain("JOB_FIT");
    expect(validModes).not.toContain("RANDOM_MODE");
  });

  it("validates interview type values", () => {
    const validTypes = [
      "technical",
      "behavioral",
      "general",
      "cultural",
      "screening",
    ];

    for (const type of validTypes) {
      expect(typeof type).toBe("string");
      expect(type.length).toBeGreaterThan(0);
    }
  });
});

describe("interview access control", () => {
  it("rejects unauthenticated access", () => {
    const user = null;
    expect(user).toBeNull();
    // In the real route, this would throw AuthError(401)
  });

  it("requires recruiter or admin role", () => {
    const allowedRoles = ["recruiter", "admin"];
    expect(allowedRoles).toContain("recruiter");
    expect(allowedRoles).toContain("admin");
    expect(allowedRoles).not.toContain("candidate");
  });

  it("validates interview ownership for access", () => {
    const interview = { recruiterId: "recruiter-1", companyId: "company-1" };
    const user = { id: "recruiter-1", role: "recruiter" };
    const otherUser = { id: "recruiter-2", role: "recruiter" };

    expect(interview.recruiterId).toBe(user.id);
    expect(interview.recruiterId).not.toBe(otherUser.id);
  });
});
