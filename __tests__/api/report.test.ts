import { describe, it, expect } from "vitest";

describe("candidate report policy filtering", () => {
  // Simulates the filtering logic from app/api/candidate/interviews/[id]/report/route.ts
  function applyCandidateReportPolicy(
    report: Record<string, any>,
    policy: Record<string, boolean> | null
  ) {
    const showScores = policy?.showScores ?? false;
    const showStrengths = policy?.showStrengths ?? true;
    const showAreasToImprove = policy?.showAreasToImprove ?? false;

    return {
      headline: report.headline,
      summary: report.summary,
      recommendation: showScores ? report.recommendation : null,
      overallScore: showScores ? report.overallScore : null,
      domainExpertise: showScores ? report.domainExpertise : null,
      clarityStructure: showScores ? report.clarityStructure : null,
      problemSolving: showScores ? report.problemSolving : null,
      communicationScore: showScores ? report.communicationScore : null,
      measurableImpact: showScores ? report.measurableImpact : null,
      strengths: showStrengths ? report.strengths : null,
      areasToImprove: showAreasToImprove ? report.areasToImprove : null,
      // Always hidden from candidates
      riskSignals: null,
      hypothesisOutcomes: null,
      evidenceHighlights: null,
      hiringAdvice: null,
      integrityScore: null,
      integrityFlags: null,
      confidenceLevel: null,
      jobMatchScore: null,
      requirementMatches: null,
      environmentFitNotes: null,
    };
  }

  const fullReport = {
    headline: "Strong backend engineer",
    summary: "Candidate showed deep experience...",
    recommendation: "YES",
    overallScore: 82,
    domainExpertise: 85,
    clarityStructure: 75,
    problemSolving: 80,
    communicationScore: 78,
    measurableImpact: 70,
    strengths: ["Distributed systems", "API design"],
    areasToImprove: ["Frontend skills", "Testing"],
    riskSignals: [{ type: "weak_ownership", severity: "LOW" }],
    hypothesisOutcomes: [{ hypothesis: "test", outcome: "confirmed" }],
    evidenceHighlights: [{ type: "strength", summary: "test" }],
    hiringAdvice: "Hire for backend roles",
    integrityScore: 95,
    integrityFlags: [],
    confidenceLevel: "HIGH",
    jobMatchScore: 85,
    requirementMatches: [{ skillName: "Go", matchLevel: "met" }],
    environmentFitNotes: "Good remote fit",
  };

  it("hides scores by default", () => {
    const result = applyCandidateReportPolicy(fullReport, null);
    expect(result.overallScore).toBeNull();
    expect(result.recommendation).toBeNull();
    expect(result.domainExpertise).toBeNull();
  });

  it("shows strengths by default", () => {
    const result = applyCandidateReportPolicy(fullReport, null);
    expect(result.strengths).toEqual(["Distributed systems", "API design"]);
  });

  it("hides areas to improve by default", () => {
    const result = applyCandidateReportPolicy(fullReport, null);
    expect(result.areasToImprove).toBeNull();
  });

  it("always shows headline and summary", () => {
    const result = applyCandidateReportPolicy(fullReport, null);
    expect(result.headline).toBe("Strong backend engineer");
    expect(result.summary).toBe("Candidate showed deep experience...");
  });

  it("always hides sensitive fields from candidates", () => {
    const result = applyCandidateReportPolicy(fullReport, {
      showScores: true,
      showStrengths: true,
      showAreasToImprove: true,
    });
    expect(result.riskSignals).toBeNull();
    expect(result.hypothesisOutcomes).toBeNull();
    expect(result.evidenceHighlights).toBeNull();
    expect(result.hiringAdvice).toBeNull();
    expect(result.integrityScore).toBeNull();
    expect(result.confidenceLevel).toBeNull();
    expect(result.jobMatchScore).toBeNull();
  });

  it("shows scores when policy allows", () => {
    const result = applyCandidateReportPolicy(fullReport, {
      showScores: true,
      showStrengths: true,
      showAreasToImprove: false,
    });
    expect(result.overallScore).toBe(82);
    expect(result.recommendation).toBe("YES");
    expect(result.domainExpertise).toBe(85);
  });

  it("shows areas to improve when policy allows", () => {
    const result = applyCandidateReportPolicy(fullReport, {
      showScores: false,
      showStrengths: true,
      showAreasToImprove: true,
    });
    expect(result.areasToImprove).toEqual(["Frontend skills", "Testing"]);
    expect(result.overallScore).toBeNull();
  });
});
