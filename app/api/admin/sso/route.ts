import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleAuthError } from "@/lib/auth";

const VALID_PROVIDERS = ["okta", "azure-ad", "google", "saml", "oidc"];
const DOMAIN_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/;

/**
 * GET /api/admin/sso — List all SSO configurations (admin only)
 */
export async function GET() {
  try {
    await requireRole(["admin"]);

    const configs = await prisma.sSOConfig.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        company: {
          select: { id: true, name: true },
        },
      },
    });

    return NextResponse.json({ configs });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * POST /api/admin/sso — Create or update SSO configuration for a company
 * Upserts by companyId (one config per company).
 */
export async function POST(request: NextRequest) {
  try {
    await requireRole(["admin"]);

    const body = await request.json();
    const { companyId, provider, domain, metadataUrl, entityId, certificate, enabled } = body;

    // Validate required fields
    if (!companyId || typeof companyId !== "string") {
      return NextResponse.json({ error: "companyId is required" }, { status: 400 });
    }
    if (!provider || typeof provider !== "string") {
      return NextResponse.json({ error: "provider is required" }, { status: 400 });
    }
    if (!VALID_PROVIDERS.includes(provider)) {
      return NextResponse.json(
        { error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(", ")}` },
        { status: 400 }
      );
    }
    if (!domain || typeof domain !== "string") {
      return NextResponse.json({ error: "domain is required" }, { status: 400 });
    }
    if (!DOMAIN_REGEX.test(domain)) {
      return NextResponse.json({ error: "Invalid domain format" }, { status: 400 });
    }

    // Verify company exists
    const company = await prisma.client.findUnique({ where: { id: companyId } });
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    // Upsert by companyId
    const config = await prisma.sSOConfig.upsert({
      where: { companyId },
      create: {
        companyId,
        provider,
        domain: domain.toLowerCase(),
        metadataUrl: metadataUrl || null,
        entityId: entityId || null,
        certificate: certificate || null,
        enabled: typeof enabled === "boolean" ? enabled : false,
      },
      update: {
        provider,
        domain: domain.toLowerCase(),
        metadataUrl: metadataUrl ?? undefined,
        entityId: entityId ?? undefined,
        certificate: certificate ?? undefined,
        enabled: typeof enabled === "boolean" ? enabled : undefined,
      },
      include: {
        company: {
          select: { id: true, name: true },
        },
      },
    });

    return NextResponse.json({ config }, { status: 200 });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * DELETE /api/admin/sso?id=<ssoConfigId> — Delete SSO config by id
 */
export async function DELETE(request: NextRequest) {
  try {
    await requireRole(["admin"]);

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id query parameter is required" }, { status: 400 });
    }

    const existing = await prisma.sSOConfig.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "SSO configuration not found" }, { status: 404 });
    }

    await prisma.sSOConfig.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
