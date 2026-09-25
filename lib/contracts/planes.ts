/**
 * Control-plane / media-plane boundary (T0.5, PRD v2.1 §10).
 *
 * The control plane (Next.js API routes, Inngest, Postgres/Redis via the
 * contracts in this directory) owns every piece of authoritative interview
 * state. The media plane (the Fly.io voice relay in `relay/` and any avatar
 * integration) is a transient transport: it may hold per-connection buffers
 * and vendor session ids, and it obtains a lease from the control plane
 * before driving an interview, but it never persists authoritative state and
 * never talks to the database directly.
 *
 * The rule is enforced two ways:
 * 1. Types below name the assets so code can declare which plane it serves.
 * 2. ESLint `no-restricted-imports` forbids `relay/**` and avatar code from
 *    importing `@prisma/client` or `lib/prisma` (see eslint.config.mjs).
 */

export const CONTROL_PLANE_OWNS = [
  "interview_state_machine",
  "plan_version",
  "conversation_ledger",
  "evidence_refs",
  "session_leases",
  "tenant_policy",
  "entitlements",
  "usage_ledger",
  "ats_sync_state",
  "message_delivery_state",
] as const;

export const MEDIA_PLANE_MAY_HOLD = [
  "transient_audio",
  "transient_video",
  "avatar_session_id",
  "relay_connection_state",
  "jitter_buffer",
  "lease_token_copy",
] as const;

export type ControlPlaneAsset = (typeof CONTROL_PLANE_OWNS)[number];
export type MediaPlaneAsset = (typeof MEDIA_PLANE_MAY_HOLD)[number];
export type Plane = "control" | "media";

export function isControlPlaneAsset(value: string): value is ControlPlaneAsset {
  return (CONTROL_PLANE_OWNS as readonly string[]).includes(value);
}

export function isMediaPlaneAsset(value: string): value is MediaPlaneAsset {
  return (MEDIA_PLANE_MAY_HOLD as readonly string[]).includes(value);
}

/** Returns the plane that may durably hold an asset, or null for unknown names. */
export function planeFor(asset: string): Plane | null {
  if (isControlPlaneAsset(asset)) return "control";
  if (isMediaPlaneAsset(asset)) return "media";
  return null;
}

/**
 * Throws when a component declared for one plane attempts to hold an asset
 * that belongs to the other. Media-plane code calls this before caching
 * anything it received from the control plane.
 */
export function assertPlaneMayHold(plane: Plane, asset: string): void {
  const owner = planeFor(asset);
  if (owner === null) throw new Error(`Unknown plane asset "${asset}"`);
  if (owner !== plane) {
    throw new Error(`The ${plane} plane must not hold "${asset}"; it belongs to the ${owner} plane`);
  }
}

/**
 * The only way the media plane may act on an interview: a lease issued by
 * the control plane's InterviewSessionStore. It carries no interview state.
 */
export interface MediaPlaneGrant {
  interviewId: string;
  leaseToken: string;
  /** ISO-8601; the media plane must stop before this. */
  expiresAt: string;
  /** URL the media plane posts events to (control-plane API), never a DB URL. */
  controlPlaneCallbackUrl: string;
}
