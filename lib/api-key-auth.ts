/**
 * API-key authentication for /api/v1/* (Phase 0 T10).
 *
 * Keys look like `t5_<prefix>_<secret>`; only the SHA-256 of the full key is
 * stored. Lookup is by prefix, comparison is constant-time, and revoked or
 * expired keys are refused. Browsers never send these automatically, so the
 * proxy skips the CSRF check for /api/v1/* requests that carry a Bearer token.
 */
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { AuthError } from "@/lib/auth";

export const API_KEY_PREFIX = "t5";
export const API_KEY_SCOPES = ["read", "write"] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export interface GeneratedKey {
  plaintext: string;
  prefix: string;
  keyHash: string;
}

export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export function generateApiKey(): GeneratedKey {
  const prefix = randomBytes(4).toString("hex");
  const secret = randomBytes(24).toString("base64url");
  const plaintext = `${API_KEY_PREFIX}_${prefix}_${secret}`;
  return { plaintext, prefix, keyHash: hashApiKey(plaintext) };
}

export function parseBearer(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return m ? m[1] : null;
}

/** The secret is base64url and may itself contain "_", so only the first two separators split. */
const KEY_SHAPE = new RegExp(`^${API_KEY_PREFIX}_([a-f0-9]{8})_([A-Za-z0-9_-]{16,})$`);

export interface ApiKeyPrincipal {
  keyId: string;
  userId: string;
  companyId: string | null;
  scopes: string[];
  name: string;
}

/** Resolve a Bearer API key to its principal, or throw AuthError(401/403). */
export async function authenticateApiKey(request: Request, requiredScope?: ApiKeyScope): Promise<ApiKeyPrincipal> {
  const token = parseBearer(request.headers.get("authorization"));
  if (!token) throw new AuthError("Missing bearer API key", 401, "API_KEY_MISSING");
  const match = KEY_SHAPE.exec(token);
  if (!match) throw new AuthError("Malformed API key", 401, "API_KEY_INVALID");
  const record = await prisma.apiKey.findFirst({ where: { prefix: match[1] } });
  if (!record) throw new AuthError("Unknown API key", 401, "API_KEY_INVALID");
  const expected = Buffer.from(record.keyHash, "hex");
  const provided = Buffer.from(hashApiKey(token), "hex");
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) throw new AuthError("Unknown API key", 401, "API_KEY_INVALID");
  if (record.revokedAt) throw new AuthError("API key revoked", 401, "API_KEY_REVOKED");
  if (record.expiresAt && record.expiresAt.getTime() < Date.now()) throw new AuthError("API key expired", 401, "API_KEY_EXPIRED");
  const scopes: string[] = record.scopes ?? [];
  if (requiredScope && !scopes.includes(requiredScope)) throw new AuthError(`API key lacks the ${requiredScope} scope`, 403, "API_KEY_SCOPE");
  prisma.apiKey.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return { keyId: record.id, userId: record.userId, companyId: record.companyId ?? null, scopes, name: record.name };
}
