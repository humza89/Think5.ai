import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import CandidateHeader from "@/components/candidate/CandidateHeader";
import TabsNav from "@/components/candidate/TabsNav";
import DetailsSidebar from "@/components/candidate/DetailsSidebar";

export const dynamic = "force-dynamic";

async function getCandidate(id: string) {
  return prisma.candidate.findUnique({
    where: { id },
  });
}

export default async function CandidateLayout({
  params,
  children
}: {
  params: Promise<{ id: string }>;
  children: ReactNode;
}) {
  const { id } = await params;
  const candidate = await getCandidate(id);
  if (!candidate) return notFound();

  return (
    <>
      <div className="flex w-full max-w-[1800px] mx-auto">
        <div className="flex-1 min-w-0 bg-white">
          <CandidateHeader candidate={candidate} />
          <TabsNav id={candidate.id} />
          <div className="p-6">{children}</div>
        </div>
        <aside className="w-[360px] border-l bg-white">
          <DetailsSidebar candidate={candidate} />
        </aside>
      </div>
    </>
  );
}
