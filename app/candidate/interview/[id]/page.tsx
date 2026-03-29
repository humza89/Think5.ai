import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import CandidateInterviewClient from "./client-page";

export default async function CandidateInterviewPage({ 
  params,
  searchParams
}: { 
  params: Promise<{ id: string }>,
  searchParams: Promise<{ token?: string }>
}) {
  const { id } = await params;
  const token = (await searchParams).token;

  if (!token) return notFound();

  const interview = await prisma.interview.findUnique({
    where: { id },
    include: {
      candidate: true,
      job: true,
    }
  });

  if (!interview || interview.accessToken !== token) {
    return notFound();
  }

  return (
    <CandidateInterviewClient 
      interviewId={id} 
      candidateName={interview.candidate.fullName} 
      jobTitle={interview.job?.title || "Candidate"} 
      accessToken={token} 
    />
  );
}
