import { NextResponse } from "next/server";

/**
 * One cron authentication rule for every /api/cron route (Phase 0 T5).
 *
 * A cron request must carry `Authorization: Bearer ${CRON_SECRET}` and the
 * secret must be configured. Before this, one cron had no check at all, one
 * only checked when the env var happened to be set, and one compared against
 * the literal string "Bearer undefined" when it was not.
 */
export function requireCronSecret(request: { headers: { get(name: string): string | null } }): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Cron secret is not configured" }, { status: 401 });
  }
  const header = request.headers.get("authorization") ?? "";
  if (header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
