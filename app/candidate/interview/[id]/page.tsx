import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { FeatureFlags } from "@/lib/feature-flags";
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

  // T4: one interview room. The legacy candidate room stays in the tree
  // (preservation contract) but traffic goes to /interview/[id], which
  // resolves the credential from the URL token or the accept cookie.
  if (FeatureFlags.P0_SINGLE_INTERVIEW_ROOM) {
    redirect(`/interview/${id}${token ? `?token=${encodeURIComponent(token)}` : ""}`);
  }

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

  const durationSeconds = (interview.template?.estimatedDuration || 45) * 60;

  return (
    <CandidateInterviewClient 
      interviewId={id} 
      candidateName={interview.candidate.fullName} 
      jobTitle={interview.job?.title || "Candidate"} 
      accessToken={token} 
      durationSeconds={durationSeconds}
      integrityMode={(interview.template as any)?.integrityMode || "none"}
    />
  );
}
