/**
 * Voice Relay JWT — Session Token Signing
 *
 * Signs short-lived JWTs for the voice relay server.
 * The relay server verifies these tokens to authenticate
 * client WebSocket connections without exposing the Gemini API key.
 */

import * as crypto from "crypto";
import { logger } from "@/lib/logger";

const RELAY_JWT_SECRET = process.env.RELAY_JWT_SECRET;

interface RelaySessionPayload {
  interviewId: string;
  sub: string; // candidate ID
  iat: number;
  exp: number;
}

/**
 * Sign a relay session token (HMAC-SHA256 JWT).
 * Lightweight implementation — no jsonwebtoken dependency in main app.
 */
export function signRelayToken(interviewId: string, candidateId: string): string {
  logger.debug(`[relay-jwt] Signing token, secret length=${RELAY_JWT_SECRET?.length ?? 0}`);
  if (!RELAY_JWT_SECRET) {
    throw new Error("RELAY_JWT_SECRET is not configured");
  }

  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload: RelaySessionPayload = {
    interviewId,
    sub: candidateId,
    iat: now,
    exp: now + 2 * 60 * 60, // 2 hours
  };

  const base64url = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64url");

  const headerB64 = base64url(header);
  const payloadB64 = base64url(payload);
  const signature = crypto
    .createHmac("sha256", RELAY_JWT_SECRET)
    .update(`${headerB64}.${payloadB64}`)
    .digest("base64url");

  return `${headerB64}.${payloadB64}.${signature}`;
}
