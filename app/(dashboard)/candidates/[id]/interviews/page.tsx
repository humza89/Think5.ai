import { prisma } from "@/lib/prisma";
import InterviewsClient from "./InterviewsClient";

export const dynamic = "force-dynamic";

export default async function InterviewsTab({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const rawInterviews = await prisma.interview.findMany({
    where: { candidateId: id },
    select: {
      id: true,
      type: true,
      status: true,
      createdAt: true,
      startedAt: true,
      completedAt: true,
      invitedEmail: true,
      report: {
        select: {
          id: true,
          overallScore: true,
          recommendation: true,
          summary: true,
          domainExpertise: true,
          problemSolving: true,
          communicationScore: true,
          strengths: true,
          areasToImprove: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Serialize dates for client component
  const interviews = rawInterviews.map((i: (typeof rawInterviews)[number]) => ({
    ...i,
    createdAt: i.createdAt.toISOString(),
    startedAt: i.startedAt?.toISOString() ?? null,
    completedAt: i.completedAt?.toISOString() ?? null,
  }));

  const candidate = await prisma.candidate.findUnique({
    where: { id },
    select: { id: true, fullName: true, email: true },
  });

  return (
    <InterviewsClient
      candidateId={id}
      candidateName={candidate?.fullName || ""}
      candidateEmail={candidate?.email || ""}
      initialInterviews={interviews}
    />
  );
}
