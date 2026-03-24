/**
 * GDPR Data Export API (Article 20 — Data Portability)
 *
 * GET /api/candidate/data-export
 *
 * Returns all candidate data as a downloadable JSON file.
 * Rate limited to 1 export per 24 hours.
 */

import { NextResponse } from "next/server";
import { requireCandidateRole, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const { candidate } = await requireCandidateRole();

    // Rate limiting via updatedAt check (simple approach without Redis dependency)
    // In production, use Redis key `data-export:{candidateId}` with 24h TTL
    const lastExport = await prisma.activityLog.findFirst({
      where: {
        entityType: "candidate",
        entityId: candidate.id,
        action: "data_export",
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });

    if (lastExport) {
      return NextResponse.json(
        {
          error:
            "Rate limited. You can only export your data once every 24 hours.",
        },
        {
          status: 429,
          headers: {
            "Retry-After": "86400",
          },
        }
      );
    }

    // Fetch all candidate data
    const fullCandidate = await prisma.candidate.findUnique({
      where: { id: candidate.id },
      include: {
        skills: true,
        experiences: true,
        education: true,
        certifications: true,
        interviews: {
          select: {
            id: true,
            type: true,
            mode: true,
            status: true,
            transcript: true,
            startedAt: true,
            completedAt: true,
            consentRecording: true,
            consentProctoring: true,
            consentPrivacy: true,
            consentedAt: true,
            overallScore: true,
            isPractice: true,
            report: {
              select: {
                summary: true,
                strengths: true,
                areasToImprove: true,
                recommendation: true,
                technicalSkills: true,
                softSkills: true,
                domainExpertise: true,
                communicationScore: true,
                problemSolving: true,
                createdAt: true,
              },
            },
          },
        },
        notifications: {
          select: {
            id: true,
            type: true,
            title: true,
            message: true,
            read: true,
            createdAt: true,
          },
        },
      },
    });

    if (!fullCandidate) {
      return NextResponse.json(
        { error: "Candidate data not found" },
        { status: 404 }
      );
    }

    // Build portable export
    const exportData = {
      exportDate: new Date().toISOString(),
      exportFormat: "GDPR Article 20 - Data Portability",
      dataSubject: {
        fullName: fullCandidate.fullName,
        email: fullCandidate.email,
        phone: fullCandidate.phone,
        linkedinUrl: fullCandidate.linkedinUrl,
        currentTitle: fullCandidate.currentTitle,
        currentCompany: fullCandidate.currentCompany,
        location: fullCandidate.location,
        experienceYears: fullCandidate.experienceYears,
        createdAt: fullCandidate.createdAt,
      },
      skills: fullCandidate.skills,
      experience: fullCandidate.experiences,
      education: fullCandidate.education,
      certifications: fullCandidate.certifications,
      interviews: fullCandidate.interviews.map((interview: any) => ({
        id: interview.id,
        type: interview.type,
        mode: interview.mode,
        status: interview.status,
        isPractice: interview.isPractice,
        startedAt: interview.startedAt,
        completedAt: interview.completedAt,
        transcript: interview.transcript,
        consent: {
          recording: interview.consentRecording,
          proctoring: interview.consentProctoring,
          privacy: interview.consentPrivacy,
          consentedAt: interview.consentedAt,
        },
        report: interview.report
          ? {
              summary: interview.report.summary,
              strengths: interview.report.strengths,
              areasToImprove: interview.report.areasToImprove,
              recommendation: interview.report.recommendation,
              scores: {
                technicalSkills: interview.report.technicalSkills,
                softSkills: interview.report.softSkills,
                domainExpertise: interview.report.domainExpertise,
                communicationScore: interview.report.communicationScore,
                problemSolving: interview.report.problemSolving,
              },
              createdAt: interview.report.createdAt,
            }
          : null,
      })),
      notifications: fullCandidate.notifications,
    };

    // Log the export for rate limiting and audit
    await prisma.activityLog
      .create({
        data: {
          action: "data_export",
          entityType: "candidate",
          entityId: candidate.id,
          metadata: { format: "json", exportDate: exportData.exportDate },
        },
      })
      .catch(() => {});

    const dateStr = new Date().toISOString().split("T")[0];

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="data-export-${dateStr}.json"`,
      },
    });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
