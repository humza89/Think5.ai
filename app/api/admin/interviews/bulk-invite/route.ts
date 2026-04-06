import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";

const BulkInviteRowSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  interviewType: z.enum(["TECHNICAL", "BEHAVIORAL", "DOMAIN_EXPERT", "LANGUAGE", "CASE_STUDY"]).optional(),
  templateId: z.string().uuid().optional(),
});

const BulkInviteSchema = z.object({
  candidates: z.array(BulkInviteRowSchema).min(1).max(500),
  templateId: z.string().uuid().optional(),
  interviewType: z.string().optional(),
  jobId: z.string().uuid().optional(),
});

/**
 * POST /api/admin/interviews/bulk-invite
 *
 * Accepts a list of candidates (from CSV upload or direct JSON) and creates
 * interview invitations in batch. Deduplicates by email.
 */
export async function POST(req: NextRequest) {
  try {
    const { user, profile } = await requireRole(["admin", "recruiter"]);

    const body = await req.json();
    const parsed = BulkInviteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { candidates, templateId: globalTemplateId, interviewType: globalType, jobId } = parsed.data;

    // Deduplicate by email (case-insensitive)
    const emailMap = new Map<string, typeof candidates[number]>();
    for (const candidate of candidates) {
      const key = candidate.email.toLowerCase();
      if (!emailMap.has(key)) {
        emailMap.set(key, candidate);
      }
    }

    const uniqueCandidates = Array.from(emailMap.values());

    // Check for existing invitations (prevent duplicates)
    const existingInvitations = await prisma.interviewInvitation.findMany({
      where: {
        email: { in: uniqueCandidates.map((c) => c.email.toLowerCase()) },
        status: { in: ["PENDING", "SENT", "DELIVERED"] },
      },
      select: { email: true },
    });

    const existingEmails = new Set(existingInvitations.map((inv: { email: string }) => inv.email.toLowerCase()));

    // Fetch recruiter info
    const recruiter = await prisma.recruiter.findFirst({
      where: { supabaseUserId: user.id },
      select: { id: true, companyId: true },
    });

    if (!recruiter) {
      return NextResponse.json({ error: "Recruiter profile not found" }, { status: 404 });
    }

    const results = {
      created: 0,
      skippedDuplicate: 0,
      failed: 0,
      details: [] as Array<{ email: string; status: "created" | "skipped" | "failed"; reason?: string }>,
    };

    // Process in batches of 50
    const BATCH_SIZE = 50;
    for (let i = 0; i < uniqueCandidates.length; i += BATCH_SIZE) {
      const batch = uniqueCandidates.slice(i, i + BATCH_SIZE);

      for (const candidate of batch) {
        const email = candidate.email.toLowerCase();

        if (existingEmails.has(email)) {
          results.skippedDuplicate++;
          results.details.push({ email, status: "skipped", reason: "Existing pending invitation" });
          continue;
        }

        try {
          // Find or create candidate record
          let candidateRecord = await prisma.candidate.findFirst({
            where: { email },
            select: { id: true },
          });

          if (!candidateRecord) {
            candidateRecord = await prisma.candidate.create({
              data: {
                email,
                fullName: candidate.name || email.split("@")[0],
                recruiterId: recruiter.id,
                status: "SOURCED",
              },
              select: { id: true },
            });
          }

          // Create interview
          const interview = await prisma.interview.create({
            data: {
              candidateId: candidateRecord.id,
              scheduledBy: recruiter.id,
              type: (candidate.interviewType || globalType || "TECHNICAL") as string,
              status: "PENDING",
              mode: "GENERAL_PROFILE",
              jobId: jobId || undefined,
              templateId: candidate.templateId || globalTemplateId || undefined,
              companyId: recruiter.companyId || undefined,
            },
            select: { id: true },
          });

          // Create invitation
          const token = crypto.randomUUID();
          await prisma.interviewInvitation.create({
            data: {
              interviewId: interview.id,
              recruiterId: recruiter.id,
              candidateId: candidateRecord.id,
              email,
              token,
              status: "CREATED",
              expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
              jobId: jobId || undefined,
            },
          });

          results.created++;
          results.details.push({ email, status: "created" });
        } catch (error) {
          results.failed++;
          results.details.push({
            email,
            status: "failed",
            reason: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
    }

    // Audit log
    await logActivity({
      userId: user.id,
      userRole: profile.role,
      action: "interview.bulk_invite",
      entityType: "InterviewInvitation",
      entityId: "bulk",
      metadata: {
        totalRequested: candidates.length,
        created: results.created,
        skippedDuplicate: results.skippedDuplicate,
        failed: results.failed,
      },
    });

    return NextResponse.json({
      success: true,
      ...results,
      // Don't return full details array if > 100 (too large)
      details: results.details.length > 100 ? undefined : results.details,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AuthError") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    Sentry.captureException(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
