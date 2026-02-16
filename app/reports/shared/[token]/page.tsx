import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { InterviewReportViewer } from "@/components/interview/InterviewReportViewer";

export const dynamic = "force-dynamic";

export default async function SharedReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const report = await prisma.interviewReport.findUnique({
    where: { shareToken: token },
    include: {
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

  // Check expiry
  if (report.shareExpiresAt && new Date() > new Date(report.shareExpiresAt)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Link Expired
          </h1>
          <p className="text-gray-500">
            This shared report link has expired. Please request a new link from
            the recruiter.
          </p>
        </div>
      </div>
    );
  }

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
            overallScore:
              report.overallScore ?? report.interview.overallScore,
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
          }}
          candidateName={report.interview.candidate.fullName}
          candidateTitle={report.interview.candidate.currentTitle}
          interviewType={report.interview.type}
          interviewDate={report.interview.createdAt.toISOString()}
          transcript={report.interview.transcript as any}
          integrityEvents={report.interview.integrityEvents as any}
        />
      </main>
    </div>
  );
}
