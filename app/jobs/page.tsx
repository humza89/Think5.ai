import { prisma } from "@/lib/prisma";
import { JobListTable } from "@/components/jobs/JobListTable";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export default async function JobsPage() {
  let jobs: any[] = [];
  let total = 0;

  try {
    [jobs, total] = await Promise.all([
      prisma.job.findMany({
        include: {
          company: { select: { id: true, name: true, logoUrl: true } },
          recruiter: { select: { id: true, name: true } },
          _count: {
            select: {
              applications: true,
              matches: true,
              interviews: true,
            },
          },
          jobSkills: true,
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.job.count(),
    ]);
  } catch (error) {
    console.error("Failed to load jobs:", error);
  }

  return (
    <ProtectedRoute allowedRoles={["recruiter", "admin"]}>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-[1400px] mx-auto px-6 py-8">
          <JobListTable
            initialJobs={JSON.parse(JSON.stringify(jobs))}
            initialPagination={{
              page: 1,
              limit: 20,
              total,
              totalPages: Math.ceil(total / 20),
            }}
          />
        </div>
      </div>
    </ProtectedRoute>
  );
}
