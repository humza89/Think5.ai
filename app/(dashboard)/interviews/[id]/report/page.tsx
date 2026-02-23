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
    <>
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
    </>
  );
}
