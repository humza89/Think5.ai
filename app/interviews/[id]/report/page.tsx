import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { requireInterviewAccess, AuthError } from "@/lib/auth";
import { InterviewReportViewer } from "@/components/interview/InterviewReportViewer";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Auth check — recruiter must own the interview or be admin
  try {
    await requireInterviewAccess(id);
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/auth/signin");
    }
    throw error;
  }

  const interview = await prisma.interview.findUnique({
    where: { id },
    include: {
      candidate: {
        select: {
          id: true,
          fullName: true,
          currentTitle: true,
        },
      },
      report: true,
    },
  });

  if (!interview || !interview.report) {
    return notFound();
  }

  const report = interview.report;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b no-print">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center space-x-8">
            <Link href="/" className="text-2xl font-bold">
              Paraform
            </Link>
            <nav className="flex space-x-6">
              <Link
                href="/dashboard"
                className="text-gray-600 hover:text-gray-900 pb-4"
              >
                Dashboard
              </Link>
              <Link
                href="/candidates"
                className="text-gray-600 hover:text-gray-900 pb-4"
              >
                Candidates
              </Link>
              <Link
                href="/clients"
                className="text-gray-600 hover:text-gray-900 pb-4"
              >
                Clients
              </Link>
              <Link
                href="/interviews"
                className="text-blue-600 font-medium border-b-2 border-blue-600 pb-4"
              >
                Interviews
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        <div className="mb-6 no-print">
          <Link
            href="/interviews"
            className="text-sm text-blue-600 hover:underline"
          >
            &larr; Back to Interviews
          </Link>
        </div>

        <InterviewReportViewer
          report={{
            overallScore: report.overallScore ?? interview.overallScore,
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
          candidateName={interview.candidate.fullName}
          candidateTitle={interview.candidate.currentTitle}
          interviewType={interview.type}
          interviewDate={interview.createdAt.toISOString()}
          transcript={interview.transcript as any}
          integrityEvents={interview.integrityEvents as any}
          interviewId={interview.id}
        />
      </main>
    </div>
  );
}
