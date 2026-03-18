import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleAuthError } from "@/lib/auth";
import type { OnboardingStatus } from "@prisma/client";

const VALID_STATUSES: OnboardingStatus[] = [
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "ON_HOLD",
];

export async function GET(request: NextRequest) {
  try {
    await requireRole(["admin"]);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "PENDING_APPROVAL";
    const search = searchParams.get("search") || "";
    const sort = searchParams.get("sort") || "createdAt";
    const order = searchParams.get("order") || "desc";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Record<string, unknown> = {
      onboardingCompleted: true,
    };

    if (status !== "all" && VALID_STATUSES.includes(status as OnboardingStatus)) {
      where.onboardingStatus = status;
    } else if (status === "all") {
      where.onboardingStatus = { in: VALID_STATUSES };
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
          where: { onboardingCompleted: true, onboardingStatus: "PENDING_APPROVAL" },
        }),
        prisma.candidate.count({
          where: { onboardingCompleted: true, onboardingStatus: "APPROVED" },
        }),
        prisma.candidate.count({
          where: { onboardingCompleted: true, onboardingStatus: "REJECTED" },
        }),
        prisma.candidate.count({
          where: { onboardingCompleted: true, onboardingStatus: "ON_HOLD" },
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
