import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthenticatedUser,
  getRecruiterForUser,
  requireCandidateAccess,
  requireRecruiterRole,
  handleAuthError,
} from "@/lib/auth";
import { scopeQuery } from "@/lib/tenant-context";
import { computeJsonHash } from "@/lib/versioning";
import { captureTemplateSnapshot } from "@/lib/template-snapshot";
import { enforceBudgetGate } from "@/lib/ai-usage";

// POST - Schedule an interview for a candidate
export async function POST(request: NextRequest) {
  try {
    const { user, profile } = await getAuthenticatedUser();

    if (!profile || !["recruiter", "admin", "hiring_manager"].includes(profile.role)) {
      return NextResponse.json(
        { error: "Forbidden: insufficient permissions" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      candidateId,
      type = "TECHNICAL",
      mode = "GENERAL_PROFILE",
      voiceProvider = "text-sse",
      templateId,
      jobId,
      isPractice = false,
      recruiterObjectives,
      hmNotes,
      customScreeningQuestions,
    } = body;

    if (!candidateId) {
      return NextResponse.json(
        { error: "candidateId is required" },
        { status: 400 }
      );
    }

    // Verify ownership of the candidate
    await requireCandidateAccess(candidateId);

    // Get recruiter record — HMs use a company recruiter as scheduledBy
    let recruiter;
    if (profile.role === "hiring_manager") {
      // Use explicit membership to find the HM's company
      const membership = await prisma.hiringManagerMembership.findFirst({
        where: { userId: user.id, isActive: true },
      });
      if (!membership) {
        return NextResponse.json(
          { error: "No company membership found. Contact your admin to request access." },
          { status: 403 }
        );
      }
      // Check membership expiry
      if (membership.expiresAt && new Date() > membership.expiresAt) {
        return NextResponse.json(
          { error: "Your hiring manager access has expired. Contact your admin to renew." },
          { status: 403 }
        );
      }
      // Find a recruiter in the membership company to use as scheduledBy
      const companyRecruiter = await prisma.recruiter.findFirst({
        where: { companyId: membership.companyId },
      });
      if (!companyRecruiter) {
        return NextResponse.json(
          { error: "No recruiter found in your company. Contact your admin." },
          { status: 403 }
        );
      }
      recruiter = companyRecruiter;
    } else {
      recruiter = await getRecruiterForUser(
        user.id,
        profile.email,
        `${profile.first_name} ${profile.last_name}`
      );
    }

    // Budget enforcement: block non-practice interviews if company exceeds AI budget
    if (!isPractice && recruiter.companyId) {
      const isAdmin = profile.role === "admin";
      const budgetResult = await enforceBudgetGate(recruiter.companyId, {
        adminOverride: isAdmin,
      });
      if (!budgetResult.allowed) {
        return NextResponse.json(
          { error: budgetResult.reason, spend: budgetResult.spend, budget: budgetResult.budget },
          { status: 402 }
        );
      }
    }

    // Verify candidate exists
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
    });

    if (!candidate) {
      return NextResponse.json(
        { error: "Candidate not found" },
        { status: 404 }
      );
    }

    // Generate interview plan for all non-practice interviews
    let interviewPlan = null;
    if (!isPractice) {
      try {
        const { generateInterviewPlan } = await import("@/lib/interview-planner");
        const job = jobId
          ? await prisma.job.findUnique({ where: { id: jobId } })
          : null;

        interviewPlan = await generateInterviewPlan(
          {
            fullName: candidate.fullName,
            currentTitle: candidate.currentTitle,
            currentCompany: candidate.currentCompany,
            skills: candidate.skills as string[],
            experienceYears: candidate.experienceYears,
            resumeText: candidate.resumeText,
          },
          {
            title: job?.title || type,
            skillsRequired: (job?.skillsRequired as string[]) || [],
            skillsPreferred: (job?.skillsPreferred as string[]) || [],
            description: job?.description || undefined,
          },
          [], // default modules — can be customized from template
          {
            mode,
            recruiterObjectives,
            hmNotes: typeof hmNotes === "string" ? hmNotes : hmNotes ? JSON.stringify(hmNotes) : undefined,
            customScreeningQuestions,
          }
        );
      } catch (err) {
        console.error("Failed to generate interview plan:", err);
        // Continue without plan — Aria will use default behavior
      }
    }

    // Capture immutable template snapshot for audit trail
    let templateSnapshot = undefined;
    let templateSnapshotHash = undefined;
    if (templateId) {
      try {
        const snapshotResult = await captureTemplateSnapshot(templateId);
        templateSnapshot = snapshotResult.snapshot;
        templateSnapshotHash = snapshotResult.hash;
      } catch (err) {
        console.error("Failed to capture template snapshot:", err);
      }
    }

    // Accept accommodations from request body
    const accommodations = body.accommodations || null;

    // Text-only accommodation check
    if (accommodations?.textOnly && voiceProvider === "gemini-live") {
      return NextResponse.json(
        { error: "Voice interviews are not available with text-only accommodation. Use text-sse provider." },
        { status: 400 }
      );
    }

    // Retake governance check
    if (templateId) {
      const template = await prisma.interviewTemplate.findUnique({
        where: { id: templateId },
        select: { retakePolicy: true },
      });
      const retakePolicy = template?.retakePolicy as { allowed?: boolean; cooldownDays?: number; maxRetakes?: number } | null;

      if (retakePolicy && retakePolicy.allowed === false) {
        const existingInterview = await prisma.interview.findFirst({
          where: {
            candidateId,
            templateId,
            status: "COMPLETED",
          },
        });
        if (existingInterview) {
          return NextResponse.json(
            { error: "Retakes are not allowed for this interview template" },
            { status: 400 }
          );
        }
      }

      if (retakePolicy?.cooldownDays) {
        const cooldownDate = new Date();
        cooldownDate.setDate(cooldownDate.getDate() - retakePolicy.cooldownDays);
        const recentInterview = await prisma.interview.findFirst({
          where: {
            candidateId,
            templateId,
            status: "COMPLETED",
            completedAt: { gte: cooldownDate },
          },
        });
        if (recentInterview) {
          return NextResponse.json(
            { error: `Retake cooldown not elapsed. Please wait ${retakePolicy.cooldownDays} days between attempts.` },
            { status: 400 }
          );
        }
      }

      if (retakePolicy?.maxRetakes) {
        const completedCount = await prisma.interview.count({
          where: {
            candidateId,
            templateId,
            status: "COMPLETED",
          },
        });
        if (completedCount >= retakePolicy.maxRetakes) {
          return NextResponse.json(
            { error: `Maximum retake limit (${retakePolicy.maxRetakes}) reached for this template` },
            { status: 400 }
          );
        }
      }
    }

    // Create interview with tenant scoping
    const interview = await prisma.interview.create({
      data: {
        candidateId,
        scheduledBy: recruiter.id,
        type,
        mode,
        status: "PENDING",
        voiceProvider,
        templateId: templateId || undefined,
        jobId: jobId || undefined,
        isPractice,
        interviewPlan: interviewPlan as any,
        interviewPlanVersion: interviewPlan ? computeJsonHash(interviewPlan) : undefined,
        templateSnapshot: templateSnapshot as any,
        templateSnapshotHash,
        accommodations: accommodations as any,
        retakeOfInterviewId: body.retakeOfInterviewId || null,
        companyId: recruiter.companyId || undefined,
        recruiterObjectives: recruiterObjectives ? recruiterObjectives : undefined,
        hmNotes: hmNotes ? (typeof hmNotes === "string" ? hmNotes : hmNotes) : undefined,
      },
      include: {
        candidate: {
          select: {
            id: true,
            fullName: true,
            email: true,
            currentTitle: true,
          },
        },
        recruiter: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Auto-create invitation record so cascadeInterviewStatus has a target
    try {
      const invitation = await prisma.interviewInvitation.create({
        data: {
          interviewId: interview.id,
          candidateId,
          templateId: templateId || null,
          status: "ACCEPTED",
          acceptedAt: new Date(),
          sentAt: new Date(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
      });
      // Link invitation back to interview
      await prisma.interview.update({
        where: { id: interview.id },
        data: { invitationId: invitation.id },
      });
    } catch (invErr) {
      // Non-critical — don't fail interview creation for invitation tracking
      console.error("Auto-invitation creation failed:", invErr);
    }

    return NextResponse.json(interview, { status: 201 });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    console.error("Error scheduling interview:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

// GET - List interviews (filtered by session recruiter)
export async function GET(request: NextRequest) {
  try {
    const { user, profile } = await getAuthenticatedUser();

    if (!profile || !["recruiter", "admin", "hiring_manager"].includes(profile.role)) {
      return NextResponse.json(
        { error: "Forbidden: insufficient permissions" },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");
    const type = searchParams.get("type");
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "20", 10);
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = searchParams.get("sortOrder") || "desc";
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    const where: any = {};

    // Recruiters: only see interviews they scheduled, scoped by tenant
    if (profile.role === "recruiter") {
      const recruiter = await getRecruiterForUser(
        user.id,
        profile.email,
        `${profile.first_name} ${profile.last_name}`
      );
      where.scheduledBy = recruiter.id;

      // Apply tenant isolation — only see interviews belonging to their company
      if (recruiter.companyId) {
        where.companyId = recruiter.companyId;
      }
    }

    // Hiring managers: see all interviews in their company (via explicit membership)
    if (profile.role === "hiring_manager") {
      const membership = await prisma.hiringManagerMembership.findFirst({
        where: { userId: user.id, isActive: true },
      });
      if (membership) {
        // Check membership expiry
        if (!membership.expiresAt || new Date() <= membership.expiresAt) {
          where.companyId = membership.companyId;
        }
      }
    }

    if (status) {
      where.status = status;
    }

    if (type) {
      where.type = type;
    }

    // E2: Search by candidate name
    if (search) {
      where.candidate = {
        fullName: { contains: search, mode: "insensitive" },
      };
    }

    // E4: Date range filter
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    // E3: Sort options
    const validSortFields = ["createdAt", "overallScore", "status"];
    const orderByField = validSortFields.includes(sortBy) ? sortBy : "createdAt";
    const order = sortOrder === "asc" ? "asc" : "desc";

    // E1: Pagination
    const skip = (page - 1) * pageSize;
    const take = Math.min(pageSize, 100); // Cap at 100

    const [interviews, total] = await Promise.all([
      prisma.interview.findMany({
        where,
        include: {
          candidate: {
            select: {
              id: true,
              fullName: true,
              email: true,
              currentTitle: true,
              profileImage: true,
            },
          },
          recruiter: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          report: {
            select: {
              id: true,
              overallScore: true,
              recommendation: true,
              summary: true,
            },
          },
        },
        orderBy: { [orderByField]: order } as any,
        skip,
        take,
      }),
      prisma.interview.count({ where }),
    ]);

    return NextResponse.json({
      interviews,
      total,
      page,
      pageSize: take,
    });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    console.error("Error fetching interviews:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
