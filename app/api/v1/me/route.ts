import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-key-auth";
import { handleAuthError } from "@/lib/auth";

/** GET /api/v1/me — identifies the API key (Phase 0 T10; first key-authenticated v1 route). */
export async function GET(request: NextRequest) {
  try {
    const principal = await authenticateApiKey(request);
    return NextResponse.json({ keyId: principal.keyId, name: principal.name, scopes: principal.scopes, companyId: principal.companyId }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
