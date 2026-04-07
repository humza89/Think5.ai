/**
 * CSV Export — export interview results for a job requisition.
 */

import { NextRequest } from "next/server";
import { requireRole, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logInterviewActivity, getClientIp } from "@/lib/interview-audit";

export async function GET(request: NextRequest) {
  let user;
  try {
    user = await requireRole(["admin", "recruiter", "hiring_manager"]);
  } catch (err) {
    if (err instanceof AuthError) {
      return Response.json({ error: err.message }, { status: err.statusCode });
    }
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");
  const status = searchParams.get("status") || "REPORT_READY";

  const where: Record<string, unknown> = { status };
  if (jobId) where.jobId = jobId;

  const interviews = await prisma.interview.findMany({
    where,
    include: {
      candidate: { select: { id: true, fullName: true, email: true } },
      report: {
        select: {
          overallScore: true, recommendation: true, confidenceLevel: true,
          domainExpertise: true, communicationScore: true, problemSolving: true,
          professionalExperience: true, thinkingJudgment: true, roleFit: true,
          culturalFit: true, strengths: true, areasToImprove: true, integrityScore: true,
        },
      },
      job: { select: { title: true } },
    },
    orderBy: { completedAt: "desc" },
    take: 1000,
  });

  // Build CSV
  const headers = [
    "Candidate Name", "Email", "Job Title", "Interview Type", "Completed At",
    "Overall Score", "Recommendation", "Confidence", "Domain Expertise",
    "Communication", "Problem Solving", "Experience", "Thinking", "Role Fit",
    "Cultural Fit", "Integrity Score", "Strengths", "Areas to Improve",
  ];

  const escapeCSV = (val: unknown): string => {
    const str = val == null ? "" : String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = interviews.map((i: any) => [
    escapeCSV(i.candidate?.fullName),
    escapeCSV(i.candidate?.email),
    escapeCSV(i.job?.title),
    escapeCSV(i.type),
    escapeCSV(i.completedAt?.toISOString()),
    escapeCSV(i.report?.overallScore),
    escapeCSV(i.report?.recommendation),
    escapeCSV(i.report?.confidenceLevel),
    escapeCSV(i.report?.domainExpertise),
    escapeCSV(i.report?.communicationScore),
    escapeCSV(i.report?.problemSolving),
    escapeCSV(i.report?.professionalExperience),
    escapeCSV(i.report?.thinkingJudgment),
    escapeCSV(i.report?.roleFit),
    escapeCSV(i.report?.culturalFit),
    escapeCSV(i.report?.integrityScore),
    escapeCSV(Array.isArray(i.report?.strengths) ? (i.report.strengths as string[]).join("; ") : ""),
    escapeCSV(Array.isArray(i.report?.areasToImprove) ? (i.report.areasToImprove as string[]).join("; ") : ""),
  ].join(","));

  const csv = [headers.join(","), ...rows].join("\n");

  // Audit log
  logInterviewActivity({
    interviewId: jobId || "bulk-export",
    action: "report.csv_exported",
    userId: user.profile.id,
    userRole: user.profile.role,
    metadata: { count: interviews.length, jobId },
    ipAddress: getClientIp(request.headers),
  });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="interviews-export-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
