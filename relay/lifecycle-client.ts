/**
 * Lifecycle Client — thin wrapper around the Next.js /api/voice/lifecycle
 * endpoint, used by the relay to drive SessionService transitions.
 *
 * Phase 2.1. The relay is a standalone Node.js package and can't import
 * @/lib/session-service directly, so we cross the boundary over HTTP using
 * the existing RELAY_JWT_SECRET to sign a short-lived service token.
 *
 * Design notes:
 * - All methods are best-effort: if the Next.js app is unreachable or the
 *   call fails, the relay logs a warning and continues serving the voice
 *   session. Lifecycle tracking is observability, not the critical path.
 * - Service tokens are cached with a 5-minute TTL to avoid re-signing on
 *   every relay event.
 * - No retry logic here — lifecycle events are fire-and-forget. If a
 *   transition is lost, the next transition will include enough context
 *   for the client to reconcile.
 */

import jwt from "jsonwebtoken";

type LifecycleState =
  | "pending"
  | "active"
  | "reconnecting"
  | "paused"
  | "completed"
  | "failed";

const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "";
const RELAY_JWT_SECRET = process.env.RELAY_JWT_SECRET || "";
const SERVICE_TOKEN_TTL_SECONDS = 5 * 60;

let cachedServiceToken: { token: string; expiresAt: number } | null = null;

function getServiceToken(): string | null {
  if (!RELAY_JWT_SECRET) return null;
  const now = Date.now();
  if (cachedServiceToken && cachedServiceToken.expiresAt > now + 10_000) {
    return cachedServiceToken.token;
  }
  const token = jwt.sign({ svc: "relay" }, RELAY_JWT_SECRET, {
    expiresIn: SERVICE_TOKEN_TTL_SECONDS,
  });
  cachedServiceToken = {
    token,
    expiresAt: now + SERVICE_TOKEN_TTL_SECONDS * 1000,
  };
  return token;
}

async function post(body: Record<string, unknown>): Promise<boolean> {
  if (!APP_URL) {
    // No app URL configured — silently no-op. In local dev the relay may run
    // without a reachable Next.js instance; that's fine, just skip lifecycle
    // tracking rather than spamming logs.
    return false;
  }
  const token = getServiceToken();
  if (!token) {
    console.warn("[Relay/Lifecycle] RELAY_JWT_SECRET not set — lifecycle tracking disabled");
    return false;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${APP_URL}/api/voice/lifecycle`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(
        `[Relay/Lifecycle] ${body.action ?? "unknown"} failed for interview=${body.interviewId ?? "?"}: ${res.status} ${text.slice(0, 120)}`,
      );
      return false;
    }
    return true;
  } catch (err) {
    console.warn(
      `[Relay/Lifecycle] ${body.action ?? "unknown"} errored for interview=${body.interviewId ?? "?"}:`,
      (err as Error)?.message,
    );
    return false;
  }
}

/**
 * Called on first successful WebSocket connection. Creates the lifecycle
 * record if it doesn't already exist (e.g., if voice-init already created it).
 */
export async function lifecycleCreate(interviewId: string, reason: string): Promise<void> {
  await post({ action: "create", interviewId, reason });
}

/**
 * CAS transition. Prints a warning if the transition is rejected so we can
 * catch state-divergence bugs in the relay logs.
 */
export async function lifecycleTransition(
  interviewId: string,
  expectedFrom: LifecycleState,
  to: LifecycleState,
  reason: string,
): Promise<void> {
  await post({
    action: "transition",
    interviewId,
    expectedFrom,
    to,
    reason,
  });
}

export async function lifecycleHeartbeat(interviewId: string): Promise<void> {
  await post({ action: "heartbeat", interviewId });
}
