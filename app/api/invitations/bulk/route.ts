import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireApprovedAccess,
  handleAuthError,
  getRecruiterForUser,
} from "@/lib/auth";
import crypto from "crypto";
import { checkRateLimit } from "@/lib/rate-limit";

const MAX_INVITATIONS = 500;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EXPIRY_DAYS = 7;

interface BulkInvitationItem {
  email: string;
  name?: string;
  jobId?: string;
  templateId?: string;
}

interface InvitationError {
  index: number;
  reason: string;
}

export async function POST(request: NextRequest) {
  try {
    const { user, profile } = await requireApprovedAccess([
      "recruiter",
      "admin",
    ]);

    const ip =
      request.headers.get("x-forwarded-for") ??
      request.headers.get("x-real-ip") ??
      "unknown";
    const rateLimitResult = checkRateLimit(`bulk-invite:${ip}`, {
      maxRequests: 5,
      windowMs: 60000,
    });
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: "Too many bulk invitation requests. Please try again later." },
        { status: 429 }
      );
    }

    const recruiter = await getRecruiterForUser(
      user.id,
      profile.email,
      `${profile.first_name} ${profile.last_name}`
    );

    const body = await request.json();
    const { invitations } = body as { invitations: BulkInvitationItem[] };

    if (!Array.isArray(invitations) || invitations.length === 0) {
      return NextResponse.json(
        { error: "invitations array is required and must not be empty" },
        { status: 400 }
      );
    }

    if (invitations.length > MAX_INVITATIONS) {
      return NextResponse.json(
        {
          error: `Maximum ${MAX_INVITATIONS} invitations per request. Received ${invitations.length}.`,
        },
        { status: 400 }
      );
    }

    const errors: InvitationError[] = [];
    const seen = new Set<string>();
    const validInvitations: {
      index: number;
      email: string;
      name?: string;
      jobId?: string;
      templateId?: string;
    }[] = [];
    let duplicates = 0;
    let invalid = 0;

    for (let i = 0; i < invitations.length; i++) {
      const item = invitations[i];

      if (!item.email || typeof item.email !== "string") {
        invalid++;
        errors.push({ index: i, reason: "Email is required" });
        continue;
      }

      const email = item.email.trim().toLowerCase();

      if (!EMAIL_REGEX.test(email)) {
        invalid++;
        errors.push({ index: i, reason: `Invalid email: ${item.email}` });
        continue;
      }

      if (seen.has(email)) {
        duplicates++;
        errors.push({ index: i, reason: `Duplicate email: ${email}` });
        continue;
      }

      seen.add(email);
      validInvitations.push({
        index: i,
        email,
        name: item.name?.trim() || undefined,
        jobId: item.jobId || undefined,
        templateId: item.templateId || undefined,
      });
    }

    // Check for existing pending/sent invitations for these emails under this recruiter
    const existingInvitations = await prisma.interviewInvitation.findMany({
      where: {
        recruiterId: recruiter.id,
        email: { in: validInvitations.map((v) => v.email) },
        status: { in: ["PENDING", "SENT"] },
        expiresAt: { gt: new Date() },
      },
      select: { email: true },
    });

    const existingEmails = new Set(
      existingInvitations.map((inv: { email: string | null }) => inv.email?.toLowerCase())
    );

    const toCreate: typeof validInvitations = [];
    for (const inv of validInvitations) {
      if (existingEmails.has(inv.email)) {
        duplicates++;
        errors.push({
          index: inv.index,
          reason: `Active invitation already exists for ${inv.email}`,
        });
      } else {
        toCreate.push(inv);
      }
    }

    if (toCreate.length === 0) {
      return NextResponse.json({
        created: 0,
        duplicates,
        invalid,
        errors,
      });
    }

    const expiresAt = new Date(
      Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000
    );

    // Create all invitations in a single transaction
    const createdInvitations = await prisma.$transaction(
      toCreate.map((inv) =>
        prisma.interviewInvitation.create({
          data: {
            recruiterId: recruiter.id,
            email: inv.email,
            jobId: inv.jobId || null,
            templateId: inv.templateId || null,
            token: crypto.randomBytes(32).toString("hex"),
            status: "PENDING",
            expiresAt,
          },
        })
      )
    );

    return NextResponse.json(
      {
        created: createdInvitations.length,
        duplicates,
        invalid,
        errors,
      },
      { status: 201 }
    );
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    console.error("Error creating bulk invitations:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
