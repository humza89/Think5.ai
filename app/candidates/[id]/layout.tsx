import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
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
    <div className="min-h-screen bg-gray-50">
      {/* Header Navigation */}
      <header className="bg-white border-b">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
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
                  className="text-blue-600 font-medium border-b-2 border-blue-600 pb-4"
                >
                  Candidates
                </Link>
                <Link
                  href="/clients"
                  className="text-gray-600 hover:text-gray-900 pb-4"
                >
                  Clients
                </Link>
              </nav>
            </div>
          </div>
        </div>
      </header>

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
    </div>
  );
}
