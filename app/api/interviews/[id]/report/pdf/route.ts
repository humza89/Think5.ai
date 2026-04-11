import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildInterviewAccessScope, handleAuthError } from "@/lib/auth";
import { renderToBuffer } from "@react-pdf/renderer";
import { ReportPDF } from "@/lib/pdf/report-pdf";
import { logActivity } from "@/lib/activity-log";
import React from "react";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Track-1 sweep: tenant-scoped fetch. PDF downloads are a direct
    // exfiltration path if cross-tenant access leaks, so the query
    // itself MUST enforce tenant isolation at the DB layer.
    const scope = await buildInterviewAccessScope(id);
    const interview = await prisma.interview.findFirst({
      where: scope.whereFragment,
      include: {
        candidate: {
          select: { fullName: true, currentTitle: true },
        },
        report: true,
      },
    });

    if (!interview) {
      return Response.json({ error: "Interview not found" }, { status: 404 });
    }

    if (!interview.report) {
      return Response.json({ error: "Report not yet generated" }, { status: 404 });
    }

    const report = interview.report;

    // renderToBuffer expects ReactElement<DocumentProps> — cast since our component wraps Document
    const pdfBuffer = await renderToBuffer(
      React.createElement(ReportPDF, {
        candidateName: interview.candidate.fullName,
        candidateTitle: interview.candidate.currentTitle,
        interviewType: interview.type,
        interviewDate: interview.createdAt.toISOString(),
        report: {
          overallScore: report.overallScore ?? interview.overallScore,
          headline: report.headline,
          confidenceLevel: report.confidenceLevel,
          recommendation: report.recommendation,
          summary: report.summary,
          technicalSkills: report.technicalSkills as any,
          softSkills: report.softSkills as any,
          domainExpertise: report.domainExpertise,
          clarityStructure: report.clarityStructure,
          problemSolving: report.problemSolving,
          communicationScore: report.communicationScore,
          measurableImpact: report.measurableImpact,
          professionalExperience: report.professionalExperience,
          roleFit: report.roleFit,
          culturalFit: report.culturalFit,
          thinkingJudgment: report.thinkingJudgment,
          strengths: report.strengths as string[] | null,
          areasToImprove: report.areasToImprove as string[] | null,
          hiringAdvice: report.hiringAdvice,
          jobMatchScore: report.jobMatchScore,
        },
      }) as any
    );

    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `${interview.candidate.fullName.replace(/\s+/g, "_")}_Interview_Report_${timestamp}.pdf`;

    // Audit trail: log every PDF download
    await logActivity({
      userId: "pdf-export",
      userRole: "system",
      action: "report.pdf_downloaded",
      entityType: "InterviewReport",
      entityId: report.id,
      metadata: {
        interviewId: id,
        candidateName: interview.candidate.fullName,
        reportVersion: report.updatedAt?.toISOString(),
      },
    }).catch(() => {}); // Non-blocking

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Report-Version": report.updatedAt?.toISOString() || "unknown",
        "X-Report-Confidential": "true",
      },
    });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return Response.json({ error: message }, { status });
  }
}
