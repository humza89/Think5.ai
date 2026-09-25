/**
 * Canonical interview credential resolver (Phase 0 T2).
 *
 * A candidate proves access to an interview with the interview's access
 * token. Historically each route read it from a different place (JSON body,
 * `Authorization: Bearer`, `?token=`/`?accessToken=` query, or the HttpOnly
 * `interview-session` cookie that /api/interviews/accept issues). Only the
 * validate route honoured the cookie, so cookie-mode candidates were rejected
 * by voice-init and friends.
 *
 * `resolveInterviewCredential` looks in every supported place, in a fixed
 * precedence, and reports where the token came from. `assertInterviewCredential`
 * compares it with the stored token and expiry. Routes use both and never read
 * the token themselves.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * FF_P0_COOKIE_INTERVIEW_AUTH (declared in lib/feature-flags.ts for the
 * inventory). Read here directly with the same semantics as envBool so this
 * module has no dependency other than next/server and stays trivially
 * mockable in route tests.
 */
function cookieAuthEnabled(): boolean {
  const raw = process.env.FF_P0_COOKIE_INTERVIEW_AUTH;
  if (raw === undefined || raw === "") return true;
  return raw.toLowerCase() === "true" || raw === "1";
}

export const INTERVIEW_SESSION_COOKIE = "interview-session";

export type CredentialSource = "cookie" | "header" | "body" | "query";

export interface InterviewCredential {
  token: string;
  source: CredentialSource;
}

/**
 * Works with a NextRequest and with a plain Fetch API Request (as used by
 * route unit tests): query and cookies fall back to `url` and the Cookie
 * header when Next's helpers are absent.
 */
export interface CredentialRequest {
  headers: { get(name: string): string | null };
  url?: string;
  cookies?: { get(name: string): { value: string } | undefined };
  nextUrl?: { searchParams: URLSearchParams };
}

function searchParamsOf(request: CredentialRequest): URLSearchParams {
  if (request.nextUrl?.searchParams) return request.nextUrl.searchParams;
  if (request.url) {
    try {
      return new URL(request.url, "http://localhost").searchParams;
    } catch {
      return new URLSearchParams();
    }
  }
  return new URLSearchParams();
}

function cookieValueOf(request: CredentialRequest, name: string): string | undefined {
  const viaHelper = request.cookies?.get?.(name)?.value;
  if (viaHelper !== undefined) return viaHelper;
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

/** Parses the `interview-session` cookie value `${interviewId}:${token}` for this interview only. */
export function tokenFromSessionCookie(cookieValue: string | undefined, interviewId: string): string | null {
  if (!cookieValue) return null;
  const separator = cookieValue.indexOf(":");
  if (separator <= 0) return null;
  const cookieInterviewId = cookieValue.slice(0, separator);
  const token = cookieValue.slice(separator + 1);
  if (cookieInterviewId !== interviewId || !token) return null;
  return token;
}

function tokenFromBearer(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

function tokenFromBody(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const value = (body as { accessToken?: unknown }).accessToken;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function tokenFromQuery(searchParams: URLSearchParams): string | null {
  return searchParams.get("accessToken") || searchParams.get("token") || null;
}

/**
 * Precedence: explicit credentials the client attached to this request
 * (header, body, query) win over the ambient cookie, so a stale cookie can
 * never override a fresh token, and a cookie for another interview is ignored.
 */
export function resolveInterviewCredential(
  request: CredentialRequest,
  interviewId: string,
  body?: unknown,
  options: ResolveOptions = {},
): InterviewCredential | null {
  const allowCookie = options.allowCookie ?? cookieAuthEnabled();
  const header = tokenFromBearer(request.headers.get("authorization"));
  if (header) return { token: header, source: "header" };
  const fromBody = tokenFromBody(body);
  if (fromBody) return { token: fromBody, source: "body" };
  const query = tokenFromQuery(searchParamsOf(request));
  if (query) return { token: query, source: "query" };
  if (!allowCookie) return null;
  const cookie = tokenFromSessionCookie(cookieValueOf(request, INTERVIEW_SESSION_COOKIE), interviewId);
  if (cookie) return { token: cookie, source: "cookie" };
  return null;
}

export interface CredentialSubject {
  accessToken: string | null;
  /** Optional so routes that do not select expiry can still use the resolver. */
  accessTokenExpiresAt?: Date | string | null;
}

export interface ResolveOptions {
  /** Defaults to FF_P0_COOKIE_INTERVIEW_AUTH; when false the ambient cookie is ignored. */
  allowCookie?: boolean;
}

export type CredentialFailure = "missing" | "mismatch" | "expired";

export function checkInterviewCredential(
  interview: CredentialSubject,
  credential: InterviewCredential | null,
  now: Date = new Date(),
): CredentialFailure | null {
  if (!credential) return "missing";
  if (!interview.accessToken || !constantTimeEqual(interview.accessToken, credential.token)) return "mismatch";
  if (interview.accessTokenExpiresAt && now > new Date(interview.accessTokenExpiresAt)) return "expired";
  return null;
}

const FAILURE_RESPONSES: Record<CredentialFailure, { status: number; error: string }> = {
  missing: { status: 401, error: "Access token required" },
  mismatch: { status: 401, error: "Unauthorized" },
  expired: { status: 401, error: "Access token has expired" },
};

/** Returns a 401 NextResponse describing the failure, or null when the credential is valid. */
export function assertInterviewCredential(
  interview: CredentialSubject,
  credential: InterviewCredential | null,
  now: Date = new Date(),
): NextResponse | null {
  const failure = checkInterviewCredential(interview, credential, now);
  if (!failure) return null;
  const { status, error } = FAILURE_RESPONSES[failure];
  return NextResponse.json({ error, reason: failure }, { status });
}

export type CredentialOutcome =
  | { ok: true; credential: InterviewCredential }
  | { ok: false; response: NextResponse; failure: CredentialFailure };

/** Convenience for routes: resolve from the request, then check. */
export function resolveAndAssert(
  request: CredentialRequest,
  interviewId: string,
  interview: CredentialSubject,
  body?: unknown,
): CredentialOutcome {
  const credential = resolveInterviewCredential(request, interviewId, body);
  const failure = checkInterviewCredential(interview, credential);
  if (failure) {
    const { status, error } = FAILURE_RESPONSES[failure];
    return { ok: false, failure, response: NextResponse.json({ error, reason: failure }, { status }) };
  }
  return { ok: true, credential: credential as InterviewCredential };
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Re-exported for routes that need the type without importing next/server themselves.
export type { NextRequest };
