import { NextResponse } from "next/server";
import { handleAuthError, requireRole } from "@/lib/auth";
import { getRetentionPolicyDays } from "@/lib/retention-enforcement";

/** GET /api/candidate/retention-summary — the retention schedule that applies to the signed-in candidate; no record counts (Phase 0 T10). */
export async function GET() {
  try {
    await requireRole(["candidate"]);
    const policy = await getRetentionPolicyDays();
    return NextResponse.json({ policy }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
