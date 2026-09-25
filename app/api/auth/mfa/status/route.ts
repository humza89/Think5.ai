import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { mfaErrorResponse, mfaStatusFor } from "@/lib/mfa-server";

/** GET /api/auth/mfa/status — policy, assurance level and factors for the signed-in user (T9). Reachable at aal1 by design. */
export async function GET() {
  try {
    const session = await getAuthenticatedUser();
    return NextResponse.json(await mfaStatusFor(session), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return mfaErrorResponse(error);
  }
}
