import { prisma } from "@/lib/prisma";
import InterviewsClient from "./InterviewsClient";

export const dynamic = "force-dynamic";

export default async function InterviewsTab({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const interviews = await prisma.interview.findMany({
    where: { candidateId: id },
    include: {
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
