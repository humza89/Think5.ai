import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { InterviewReportViewer } from "@/components/interview/InterviewReportViewer";
import { EmailVerificationGate } from "@/components/reports/EmailVerificationGate";

export const dynamic = "force-dynamic";

export default async function SharedReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // First: lightweight check for token validity + email gate status
  const reportMeta = await prisma.interviewReport.findUnique({
    where: { shareToken: token },
    select: {
      id: true,
      shareRevoked: true,
      shareExpiresAt: true,
      recipientEmail: true,
    },
  });

  if (!reportMeta) {
    return notFound();
  }

  if (reportMeta.shareRevoked) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Revoked</h1>
          <p className="text-gray-500">
            This shared report link has been revoked. Please contact the recruiter for access.
          </p>
        </div>
      </div>
    );
  }

  if (reportMeta.shareExpiresAt && new Date() > new Date(reportMeta.shareExpiresAt)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Link Expired</h1>
          <p className="text-gray-500">
            This shared report link has expired. Please request a new link from the recruiter.
          </p>
        </div>
      </div>
    );
  }

  // If email-gated, check for valid access cookie before loading full data
  if (reportMeta.recipientEmail) {
    const cookieStore = await cookies();
    const cookieName = `report-access-${token}`;
    const cookie = cookieStore.get(cookieName);

    let cookieValid = false;
    if (cookie) {
      const emailHash = createHash("sha256")
        .update(reportMeta.recipientEmail.toLowerCase().trim())
        .digest("hex");
      const expectedCookieValue = createHash("sha256")
        .update(`${token}:${emailHash}:${process.env.NEXTAUTH_SECRET || "fallback-secret"}`)
        .digest("hex");
      cookieValid = cookie.value === expectedCookieValue;
    }

    if (!cookieValid) {
      // Show email verification gate — NO report data sent to client
      return <EmailVerificationGate token={token} />;
    }
  }

  // Cookie is valid or no email gate — load full report data
  const report = await prisma.interviewReport.findUnique({
    where: { shareToken: token },
    select: {
      id: true,
      overallScore: true,
      recommendation: true,
      summary: true,
      technicalSkills: true,
      softSkills: true,
      domainExpertise: true,
      clarityStructure: true,
      problemSolving: true,
      communicationScore: true,
      measurableImpact: true,
      strengths: true,
      areasToImprove: true,
      hiringAdvice: true,
      integrityScore: true,
      integrityFlags: true,
      headline: true,
      confidenceLevel: true,
      professionalExperience: true,
      roleFit: true,
      culturalFit: true,
      thinkingJudgment: true,
      riskSignals: true,
      hypothesisOutcomes: true,
      evidenceHighlights: true,
      jobMatchScore: true,
      requirementMatches: true,
      environmentFitNotes: true,
      interview: {
        select: {
          id: true,
          type: true,
          createdAt: true,
          overallScore: true,
          transcript: true,
          integrityEvents: true,
          candidate: {
            select: {
              fullName: true,
              currentTitle: true,
            },
          },
        },
      },
    },
  });

  if (!report) {
    return notFound();
  }

  // Log share view (fire-and-forget)
  prisma.reportShareView.create({
    data: {
      reportId: report.id,
      shareToken: token,
      viewerIp: "server-render",
      userAgent: "server-render",
    },
  }).catch(() => {});

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b no-print">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center">
            <span className="text-2xl font-bold">Think5</span>
            <span className="text-blue-600 text-2xl font-bold">.</span>
            <span className="ml-4 text-gray-500 text-sm">Shared Report</span>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        <InterviewReportViewer
          report={{
            overallScore: report.overallScore ?? report.interview.overallScore,
            recommendation: report.recommendation,
            summary: report.summary,
            technicalSkills: report.technicalSkills as any,
            softSkills: report.softSkills as any,
            domainExpertise: report.domainExpertise,
            clarityStructure: report.clarityStructure,
            problemSolving: report.problemSolving,
            communicationScore: report.communicationScore,
            measurableImpact: report.measurableImpact,
            strengths: report.strengths as string[] | null,
            areasToImprove: report.areasToImprove as string[] | null,
            hiringAdvice: report.hiringAdvice,
            integrityScore: report.integrityScore,
            integrityFlags: report.integrityFlags as any,
            headline: report.headline,
            confidenceLevel: report.confidenceLevel,
            professionalExperience: report.professionalExperience,
            roleFit: report.roleFit,
            culturalFit: report.culturalFit,
            thinkingJudgment: report.thinkingJudgment,
            riskSignals: report.riskSignals as any,
            hypothesisOutcomes: report.hypothesisOutcomes as any,
            evidenceHighlights: report.evidenceHighlights as any,
            jobMatchScore: report.jobMatchScore,
            requirementMatches: report.requirementMatches as any,
            environmentFitNotes: report.environmentFitNotes,
            memoryIntegrityScorecard: (report as any).memoryIntegrityScorecard ?? null,
          }}
          candidateName={report.interview.candidate.fullName}
          candidateTitle={report.interview.candidate.currentTitle}
          interviewType={report.interview.type}
          interviewDate={report.interview.createdAt.toISOString()}
          transcript={report.interview.transcript as any}
          integrityEvents={report.interview.integrityEvents as any}
        />
      </main>

      {/* Watermark for shared reports */}
      <div style={{
        position: 'fixed',
        top: 0, left: 0, width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
      }}>
        <div style={{
          transform: 'rotate(-45deg)',
          fontSize: '3rem', fontWeight: 'bold',
          color: 'rgba(0, 0, 0, 0.04)',
          whiteSpace: 'nowrap', userSelect: 'none',
        }}>
          Shared via Think5 — Confidential
        </div>
      </div>
    </div>
  );
}
