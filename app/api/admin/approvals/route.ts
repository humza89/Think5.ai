import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleAuthError } from "@/lib/auth";
import { resolveTenantId } from "@/lib/tenant-context";
import type { OnboardingStatus, RecruiterOnboardingStatus } from "@prisma/client";

const VALID_CANDIDATE_STATUSES: OnboardingStatus[] = [
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "ON_HOLD",
];

const VALID_RECRUITER_STATUSES: RecruiterOnboardingStatus[] = [
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
];

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRole(["admin"]);

    // Resolve tenant — scopes admin to their company's data
    const tenantId = await resolveTenantId(user.id);

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "candidates"; // "candidates" | "recruiters"
    const status = searchParams.get("status") || "PENDING_APPROVAL";
    const search = searchParams.get("search") || "";
    const sort = searchParams.get("sort") || "createdAt";
    const order = searchParams.get("order") || "desc";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const skip = (page - 1) * limit;

    if (type === "recruiters") {
      return handleRecruiterApprovals({ status, search, sort, order, page, limit, skip, tenantId });
    }

    // Build where clause for candidates
    const where: Record<string, unknown> = {
      onboardingCompleted: true,
    };

    // Scope to tenant's candidates (via recruiter association)
    if (tenantId) {
      where.recruiterId = { not: null };
      where.recruiter = { companyId: tenantId };
    }

    if (status !== "all" && VALID_CANDIDATE_STATUSES.includes(status as OnboardingStatus)) {
      where.onboardingStatus = status;
    } else if (status === "all") {
      where.onboardingStatus = { in: VALID_CANDIDATE_STATUSES };
    }

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { currentTitle: { contains: search, mode: "insensitive" } },
      ];
    }

    // Build orderBy
    const orderBy: Record<string, string> = {};
    if (sort === "fullName") {
      orderBy.fullName = order === "asc" ? "asc" : "desc";
    } else {
      orderBy.createdAt = order === "asc" ? "asc" : "desc";
    }

    // Fetch candidates + counts in parallel
    const [candidates, total, pendingCount, approvedCount, rejectedCount, onHoldCount] =
      await Promise.all([
        prisma.candidate.findMany({
          where,
          orderBy,
          skip,
          take: limit,
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            currentTitle: true,
            linkedinUrl: true,
            location: true,
            profileImage: true,
            onboardingStatus: true,
            invitationSource: true,
            rejectionReason: true,
            approvedAt: true,
            approvedBy: true,
            riskScore: true,
            riskFlags: true,
            linkedinConsistencyScore: true,
            linkedinConsistencyFlags: true,
            profileCompleteness: true,
            createdAt: true,
            updatedAt: true,
            _count: {
              select: {
                candidateSkills: true,
                candidateExperiences: true,
              },
            },
          },
        }),
        prisma.candidate.count({ where }),
        prisma.candidate.count({
          where: { onboardingCompleted: true, onboardingStatus: "PENDING_APPROVAL", ...(tenantId ? { recruiter: { companyId: tenantId } } : {}) },
        }),
        prisma.candidate.count({
          where: { onboardingCompleted: true, onboardingStatus: "APPROVED", ...(tenantId ? { recruiter: { companyId: tenantId } } : {}) },
        }),
        prisma.candidate.count({
          where: { onboardingCompleted: true, onboardingStatus: "REJECTED", ...(tenantId ? { recruiter: { companyId: tenantId } } : {}) },
        }),
        prisma.candidate.count({
          where: { onboardingCompleted: true, onboardingStatus: "ON_HOLD", ...(tenantId ? { recruiter: { companyId: tenantId } } : {}) },
        }),
      ]);

    return NextResponse.json({
      candidates,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      counts: {
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
        onHold: onHoldCount,
        all: pendingCount + approvedCount + rejectedCount + onHoldCount,
      },
    });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

async function handleRecruiterApprovals({
  status,
  search,
  sort,
  order,
  page,
  limit,
  skip,
  tenantId,
}: {
  status: string;
  search: string;
  sort: string;
  order: string;
  page: number;
  limit: number;
  skip: number;
  tenantId: string | null;
}) {
  const where: Record<string, unknown> = {
    onboardingCompleted: true,
  };

  // Scope to tenant's recruiters
  if (tenantId) {
    where.companyId = tenantId;
  }

  if (status !== "all" && VALID_RECRUITER_STATUSES.includes(status as RecruiterOnboardingStatus)) {
    where.onboardingStatus = status;
  } else if (status === "all") {
    where.onboardingStatus = { in: VALID_RECRUITER_STATUSES };
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }

  const orderBy: Record<string, string> = {};
  if (sort === "name") {
    orderBy.name = order === "asc" ? "asc" : "desc";
  } else {
    orderBy.createdAt = order === "asc" ? "asc" : "desc";
  }

  const [recruiters, total, pendingCount, approvedCount, rejectedCount] =
    await Promise.all([
      prisma.recruiter.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          onboardingStatus: true,
          createdAt: true,
          updatedAt: true,
          company: { select: { name: true } },
        },
      }),
      prisma.recruiter.count({ where }),
      prisma.recruiter.count({
        where: { onboardingCompleted: true, onboardingStatus: "PENDING_APPROVAL", ...(tenantId ? { companyId: tenantId } : {}) },
      }),
      prisma.recruiter.count({
        where: { onboardingCompleted: true, onboardingStatus: "APPROVED", ...(tenantId ? { companyId: tenantId } : {}) },
      }),
      prisma.recruiter.count({
        where: { onboardingCompleted: true, onboardingStatus: "REJECTED", ...(tenantId ? { companyId: tenantId } : {}) },
      }),
    ]);

  return NextResponse.json({
    recruiters,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    counts: {
      pending: pendingCount,
      approved: approvedCount,
      rejected: rejectedCount,
      all: pendingCount + approvedCount + rejectedCount,
    },
  });
}
