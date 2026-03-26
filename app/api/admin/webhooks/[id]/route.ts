/**
 * Single Webhook Endpoint Management
 *
 * PATCH  /api/admin/webhooks/[id] — Update webhook
 * DELETE /api/admin/webhooks/[id] — Delete webhook
 */

import { NextRequest, NextResponse } from "next/server";
import { requireRole, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function resolveAdminCompanyId(userId: string): Promise<string | null> {
  const recruiter = await prisma.recruiter.findFirst({
    where: { supabaseUserId: userId },
    select: { companyId: true },
  });
  return recruiter?.companyId ?? null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRole(["admin"]);
    const { id } = await params;
    const body = await req.json();

    const companyId = await resolveAdminCompanyId(user.id);
    if (!companyId) {
      return NextResponse.json({ error: "No company associated" }, { status: 403 });
    }

    const webhook = await prisma.webhookEndpoint.findUnique({
      where: { id },
    });

    if (!webhook || webhook.companyId !== companyId) {
      return NextResponse.json(
        { error: "Webhook not found" },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};

    if (body.url !== undefined) {
      try {
        new URL(body.url);
      } catch {
        return NextResponse.json(
          { error: "Invalid URL format" },
          { status: 400 }
        );
      }
      updateData.url = body.url;
    }

    if (body.events !== undefined) {
      if (!Array.isArray(body.events)) {
        return NextResponse.json(
          { error: "events must be an array" },
          { status: 400 }
        );
      }
      updateData.events = body.events;
    }

    if (body.isActive !== undefined) {
      updateData.isActive = Boolean(body.isActive);
    }

    const updated = await prisma.webhookEndpoint.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ webhook: updated });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRole(["admin"]);
    const { id } = await params;

    const companyId = await resolveAdminCompanyId(user.id);
    if (!companyId) {
      return NextResponse.json({ error: "No company associated" }, { status: 403 });
    }

    const webhook = await prisma.webhookEndpoint.findUnique({
      where: { id },
    });

    if (!webhook || webhook.companyId !== companyId) {
      return NextResponse.json(
        { error: "Webhook not found" },
        { status: 404 }
      );
    }

    await prisma.webhookEndpoint.delete({
      where: { id },
    });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
