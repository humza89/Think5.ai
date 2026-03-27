/**
 * @deprecated Use GET /api/interviews/invitations instead.
 * This route redirects to the canonical invitation list endpoint.
 */

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.redirect(
    new URL("/api/interviews/invitations", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
    { status: 301, headers: { "Deprecation": "true", "Sunset": "2026-06-27" } }
  );
}
