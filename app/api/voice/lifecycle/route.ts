/**
 * Voice Lifecycle API — authenticated bridge between the relay server and
 * the SessionService state machine.
 *
 * Phase 2.1 of the voice-reliability hardening plan.
 *
 * The relay is a standalone Node.js package (relay/) that can't import
 * Next.js lib modules directly. This route exposes SessionService over HTTP
 * so the relay can drive lifecycle transitions without duplicating the
 * state-machine logic. Authentication is via the same JWT secret the
 * relay already uses to verify client session tokens (RELAY_JWT_SECRET),
 * so no new credentials to deploy.
 *
 * All actions are POST-only and idempotent at the HTTP layer (the state
 * machine itself handles CAS guards).
 */

import { NextResponse, type NextRequest } from "next/server";
import jwt from "jsonwebtoken";
import { z } from "zod";
import {
  createSession,
  getSession,
  heartbeat,
  transition,
  type SessionLifecycleState,
} from "@/lib/session-service";

const LIFECYCLE_STATES = [
  "pending",
  "active",
  "reconnecting",
  "paused",
  "completed",
  "failed",
] as const satisfies readonly SessionLifecycleState[];

const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    interviewId: z.string().min(1),
    ownerToken: z.string().optional(),
    reason: z.string().optional(),
  }),
  z.object({
    action: z.literal("transition"),
    interviewId: z.string().min(1),
    expectedFrom: z.enum(LIFECYCLE_STATES),
    to: z.enum(LIFECYCLE_STATES),
    reason: z.string().min(1),
  }),
  z.object({
    action: z.literal("heartbeat"),
    interviewId: z.string().min(1),
  }),
  z.object({
    action: z.literal("get"),
    interviewId: z.string().min(1),
  }),
]);

function unauthorized(reason: string) {
  return NextResponse.json({ error: reason }, { status: 401 });
}

/**
 * Verify the relay's JWT. We reuse the same secret the relay uses for
 * client session tokens (RELAY_JWT_SECRET). The relay signs its own service
 * tokens with a distinguishing claim `svc: "relay"` so we can reject
 * candidate tokens being replayed against this endpoint.
 */
function authenticate(req: NextRequest): { ok: true } | { ok: false; reason: string } {
  const secret = process.env.RELAY_JWT_SECRET;
  if (!secret) {
    return { ok: false, reason: "server_misconfigured" };
  }
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { ok: false, reason: "missing_bearer" };
  }
  const token = authHeader.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, secret) as { svc?: string };
    if (payload.svc !== "relay") {
      return { ok: false, reason: "wrong_audience" };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "invalid_token" };
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = authenticate(req);
  if (!auth.ok) return unauthorized(auth.reason);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const payload = parsed.data;
  switch (payload.action) {
    case "create": {
      const result = await createSession({
        interviewId: payload.interviewId,
        ownerToken: payload.ownerToken,
        reason: payload.reason,
      });
      return NextResponse.json(result, { status: result.ok ? 200 : 409 });
    }
    case "transition": {
      const result = await transition({
        interviewId: payload.interviewId,
        expectedFrom: payload.expectedFrom,
        to: payload.to,
        reason: payload.reason,
      });
      return NextResponse.json(result, { status: result.ok ? 200 : 409 });
    }
    case "heartbeat": {
      const result = await heartbeat({ interviewId: payload.interviewId });
      return NextResponse.json(result, { status: result.ok ? 200 : 404 });
    }
    case "get": {
      const record = await getSession(payload.interviewId);
      if (!record) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
      return NextResponse.json({ record }, { status: 200 });
    }
  }
}
