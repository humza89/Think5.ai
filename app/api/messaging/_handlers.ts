import { NextResponse } from "next/server";
import { handleAuthError } from "@/lib/auth";
import { MessagingError } from "@/lib/messaging/service";

/** Maps service and auth errors to JSON responses. */
export function messagingErrorResponse(error: unknown): NextResponse {
  if (error instanceof MessagingError) return NextResponse.json({ error: error.message }, { status: error.status });
  const { error: message, status } = handleAuthError(error);
  return NextResponse.json({ error: message }, { status });
}
