import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { JobDetailView } from "@/components/jobs/JobDetailView";

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let job: any = null;
  try {
    job = await prisma.job.findUnique({
      where: { id },
      include: {
        company: true,
        recruiter: { select: { id: true, name: true, email: true } },
        jobSkills: true,
        applications: {
          include: {
            candidate: {
              select: {
                id: true,
                fullName: true,
                email: true,
                currentTitle: true,
                currentCompany: true,
                profileImage: true,
                ariaOverallScore: true,
              },
            },
          },
          orderBy: { appliedAt: "desc" },
          take: 50,
        },
        matches: {
          include: {
            candidate: {
              select: {
                id: true,
                fullName: true,
                email: true,
                currentTitle: true,
                currentCompany: true,
                profileImage: true,
                ariaOverallScore: true,
              },
            },
          },
          orderBy: { fitScore: "desc" },
          take: 20,
        },
        interviews: {
          include: {
            candidate: {
              select: {
                id: true,
                fullName: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        },
        _count: {
          select: {
            applications: true,
            matches: true,
            interviews: true,
            invitations: true,
          },
        },
      },
    });
  } catch (error) {
    console.error("Failed to load job:", error);
  }

  if (!job) {
    notFound();
  }

  return (
    <ProtectedRoute allowedRoles={["recruiter", "admin"]}>
      <JobDetailView job={JSON.parse(JSON.stringify(job))} />
    </ProtectedRoute>
  );
}
