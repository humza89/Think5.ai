import { NextResponse } from "next/server";

/**
 * V1 Interview Invitation Endpoint — DEPRECATED
 *
 * This endpoint has been consolidated into the canonical
 * POST /api/interviews/invite endpoint. Use that instead.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "This endpoint has been removed. Use POST /api/interviews/invite instead.",
      migration: {
        newEndpoint: "/api/interviews/invite",
        acceptsFields: ["candidateId", "email", "jobId", "templateId", "expiresInDays"],
      },
    },
    { status: 410 }
  );
}
