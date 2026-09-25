import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleAuthError, requireRole } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { API_KEY_SCOPES, generateApiKey } from "@/lib/api-key-auth";

/**
 * API keys for the signed-in admin (Phase 0 T10, minimal).
 * GET → keys (prefix, never the secret). POST { name, scopes? } → creates one
 * and returns the plaintext once. DELETE { id } → revokes.
 */
export async function GET() {
  try {
    const { user } = await requireRole(["admin"]);
    const keys = await prisma.apiKey.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, select: { id: true, name: true, prefix: true, scopes: true, lastUsedAt: true, revokedAt: true, expiresAt: true, createdAt: true } });
    return NextResponse.json({ keys }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, profile } = await requireRole(["admin"]);
    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
    const scopes = Array.isArray(body.scopes) ? body.scopes.filter((s: unknown): s is string => typeof s === "string" && (API_KEY_SCOPES as readonly string[]).includes(s)) : ["read"];
    if (scopes.length === 0) return NextResponse.json({ error: "at least one valid scope is required" }, { status: 400 });
    const active = await prisma.apiKey.count({ where: { userId: user.id, revokedAt: null } });
    if (active >= 20) return NextResponse.json({ error: "Key limit reached; revoke an unused key first" }, { status: 409 });
    const generated = generateApiKey();
    const recruiter = await prisma.recruiter.findFirst({ where: { OR: [{ supabaseUserId: user.id }, { email: (profile as { email: string }).email }] }, select: { companyId: true } });
    const key = await prisma.apiKey.create({ data: { userId: user.id, companyId: recruiter?.companyId ?? null, name, prefix: generated.prefix, keyHash: generated.keyHash, scopes } });
    await logActivity({ userId: user.id, userRole: "admin", action: "api_key.created", entityType: "ApiKey", entityId: key.id, metadata: { name, scopes } }).catch(() => {});
    return NextResponse.json({ key: { id: key.id, name, prefix: generated.prefix, scopes, createdAt: key.createdAt }, plaintext: generated.plaintext }, { status: 201 });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { user } = await requireRole(["admin"]);
    const body = await request.json().catch(() => ({}));
    const id = typeof body.id === "string" ? body.id : "";
    const key = id ? await prisma.apiKey.findFirst({ where: { id, userId: user.id } }) : null;
    if (!key) return NextResponse.json({ error: "Key not found" }, { status: 404 });
    if (!key.revokedAt) await prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
    await logActivity({ userId: user.id, userRole: "admin", action: "api_key.revoked", entityType: "ApiKey", entityId: id }).catch(() => {});
    return NextResponse.json({ revoked: true });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
