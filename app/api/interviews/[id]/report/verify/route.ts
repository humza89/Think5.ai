import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireInterviewAccess, handleAuthError } from "@/lib/auth";
import { computeEvidenceHash } from "@/lib/evidence-hash";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await requireInterviewAccess(id);

    const interview = await prisma.interview.findUnique({
      where: { id },
      select: {
        transcript: true,
        recordingUrl: true,
        report: {
          select: {
            evidenceHash: true,
            overallScore: true,
            recommendation: true,
            summary: true,
            technicalSkills: true,
            softSkills: true,
            domainExpertise: true,
            problemSolving: true,
            communicationScore: true,
            integrityScore: true,
            riskSignals: true,
            hypothesisOutcomes: true,
            jobMatchScore: true,
            evidenceHighlights: true,
          },
        },
      },
    });

    if (!interview?.report) {
      return Response.json({ error: "Report not found" }, { status: 404 });
    }

    if (!interview.report.evidenceHash) {
      return Response.json({
        verified: false,
        reason: "No evidence hash was computed for this report",
      });
    }

    const { signature: currentHash } = computeEvidenceHash(
      interview.transcript,
      {
        overallScore: interview.report.overallScore,
        recommendation: interview.report.recommendation,
        summary: interview.report.summary,
        technicalSkills: interview.report.technicalSkills,
        softSkills: interview.report.softSkills,
        domainExpertise: interview.report.domainExpertise,
        problemSolving: interview.report.problemSolving,
        communicationScore: interview.report.communicationScore,
        integrityScore: interview.report.integrityScore,
        riskSignals: interview.report.riskSignals,
        hypothesisOutcomes: interview.report.hypothesisOutcomes,
        jobMatchScore: interview.report.jobMatchScore,
        evidenceHighlights: interview.report.evidenceHighlights,
      },
      interview.recordingUrl,
      id
    );

    const verified = currentHash === interview.report.evidenceHash;

    return Response.json({
      verified,
      ...(verified
        ? { message: "Evidence bundle integrity verified" }
        : { reason: "Evidence hash mismatch — data may have been modified" }),
      hash: interview.report.evidenceHash,
    });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return Response.json({ error: message }, { status });
  }
}
