/**
 * LiveKit Access Token endpoint — Phase 3 spike stub.
 *
 * Issues a signed JWT that the browser uses to join a LiveKit room for a
 * WebRTC-based voice interview session. This is the **minimum viable**
 * feature-flagged stub for the spike in docs/spikes/livekit-webrtc-transport.md;
 * it is NOT wired into the production UI yet.
 *
 * Gated by the VOICE_TRANSPORT_WEBRTC_ENABLED env flag so the endpoint
 * returns 404 in any environment that hasn't explicitly opted in.
 *
 * The token issuance itself uses the `livekit-server-sdk` library, which is
 * intentionally NOT added to package.json in this spike commit — we'll
 * install it during the actual spike work so the dependency review has a
 * clear pairing with a feature branch. For now, this file uses a dynamic
 * import guarded by a try/catch so the Next.js build doesn't fail when the
 * package is absent and the feature flag is off.
 */

import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string }> };

const VOICE_TRANSPORT_WEBRTC_ENABLED =
  process.env.VOICE_TRANSPORT_WEBRTC_ENABLED === "true";

const LIVEKIT_URL = process.env.LIVEKIT_URL || "";
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || "";
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || "";

interface TokenResponse {
  url: string;
  token: string;
  roomName: string;
  identity: string;
  expiresAt: string;
}

interface ErrorResponse {
  error: string;
  detail?: string;
}

export async function POST(
  _req: Request,
  { params }: RouteParams,
): Promise<NextResponse<TokenResponse | ErrorResponse>> {
  // Feature flag — return 404 so the endpoint is invisible in prod until
  // the spike concludes and we intentionally flip it on.
  if (!VOICE_TRANSPORT_WEBRTC_ENABLED) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return NextResponse.json(
      {
        error: "misconfigured",
        detail: "LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET are required",
      },
      { status: 500 },
    );
  }

  const { id: interviewId } = await params;
  if (!interviewId) {
    return NextResponse.json({ error: "missing_interview_id" }, { status: 400 });
  }

  // Dynamic import so `livekit-server-sdk` doesn't need to be installed
  // unless the feature flag is on. During the spike this keeps the main
  // build clean; the install lands in the follow-up spike branch.
  let AccessToken: unknown;
  try {
    const mod = await import(/* webpackIgnore: true */ "livekit-server-sdk" as string);
    AccessToken = (mod as { AccessToken: unknown }).AccessToken;
  } catch {
    return NextResponse.json(
      {
        error: "dependency_missing",
        detail:
          "livekit-server-sdk is not installed. Install it in the Phase 3 spike branch before enabling VOICE_TRANSPORT_WEBRTC_ENABLED.",
      },
      { status: 501 },
    );
  }

  const roomName = `interview-${interviewId}`;
  const identity = `candidate-${interviewId}`;
  const ttlSeconds = 3600; // 1h, matches session TTL

  type AccessTokenCtor = new (
    apiKey: string,
    apiSecret: string,
    opts: { identity: string; ttl: number },
  ) => {
    addGrant(grant: Record<string, unknown>): void;
    toJwt(): string | Promise<string>;
  };

  const at = new (AccessToken as AccessTokenCtor)(
    LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET,
    { identity, ttl: ttlSeconds },
  );

  at.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  const rawToken = at.toJwt();
  const token = typeof rawToken === "string" ? rawToken : await rawToken;

  return NextResponse.json({
    url: LIVEKIT_URL,
    token,
    roomName,
    identity,
    expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
  });
}
