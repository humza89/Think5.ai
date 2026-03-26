/**
 * Webhook Management API
 *
 * GET  /api/admin/webhooks — List webhooks for admin's company
 * POST /api/admin/webhooks — Create a new webhook endpoint
 */

import { NextRequest, NextResponse } from "next/server";
import { requireRole, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

async function resolveAdminCompanyId(userId: string): Promise<string | null> {
  const recruiter = await prisma.recruiter.findFirst({
    where: { supabaseUserId: userId },
    select: { companyId: true },
  });
  return recruiter?.companyId ?? null;
}

export async function GET() {
  try {
    const { user } = await requireRole(["admin"]);

    const companyId = await resolveAdminCompanyId(user.id);
    if (!companyId) {
      return NextResponse.json({ error: "No company associated" }, { status: 403 });
    }

    const webhooks = await prisma.webhookEndpoint.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { deliveries: true } },
      },
    });

    return NextResponse.json({ webhooks });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireRole(["admin"]);

    const companyId = await resolveAdminCompanyId(user.id);
    if (!companyId) {
      return NextResponse.json({ error: "No company associated" }, { status: 403 });
    }

    const { url, events } = await req.json();

    if (!url || !events) {
      return NextResponse.json(
        { error: "Missing required fields: url, events" },
        { status: 400 }
      );
    }

    if (!Array.isArray(events) || events.length === 0) {
      return NextResponse.json(
        { error: "events must be a non-empty array" },
        { status: 400 }
      );
    }

    const validEvents = [
      "interview.completed",
      "report.ready",
      "invitation.accepted",
    ];
    const invalidEvents = events.filter(
      (e: string) => !validEvents.includes(e)
    );
    if (invalidEvents.length > 0) {
      return NextResponse.json(
        {
          error: `Invalid events: ${invalidEvents.join(", ")}. Valid events: ${validEvents.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL format" },
        { status: 400 }
      );
    }

    const secret = crypto.randomBytes(32).toString("hex");

    const webhook = await prisma.webhookEndpoint.create({
      data: {
        companyId,
        url,
        events,
        secret,
      },
    });

    return NextResponse.json(
      {
        webhook: {
          id: webhook.id,
          url: webhook.url,
          events: webhook.events,
          secret: webhook.secret, // Only shown once on creation
          isActive: webhook.isActive,
          createdAt: webhook.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
