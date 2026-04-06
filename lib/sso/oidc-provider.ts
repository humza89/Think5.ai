/**
 * OIDC Provider — Handles OpenID Connect authentication flow
 *
 * Supports: Azure AD, Google Workspace, Okta (OIDC mode)
 * Implements: Authorization Code Flow with PKCE
 */

import { createHash, randomBytes } from "crypto";

export interface OIDCConfig {
  clientId: string;
  clientSecret: string;
  issuerUrl: string;
  callbackUrl: string;
  scopes: string;
}

export interface OIDCTokens {
  accessToken: string;
  idToken: string;
  refreshToken?: string;
  expiresIn: number;
}

export interface OIDCUserInfo {
  sub: string;
  email: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
}

// ── PKCE helpers ───────────────────────────────────────────────────────

export function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

export function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function generateState(): string {
  return randomBytes(16).toString("hex");
}

// ── Discovery ──────────────────────────────────────────────────────────

interface OIDCDiscovery {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  issuer: string;
}

const discoveryCache = new Map<string, { doc: OIDCDiscovery; expiresAt: number }>();

export async function discoverOIDCEndpoints(issuerUrl: string): Promise<OIDCDiscovery> {
  const cached = discoveryCache.get(issuerUrl);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.doc;
  }

  const wellKnownUrl = `${issuerUrl.replace(/\/$/, "")}/.well-known/openid-configuration`;
  const response = await fetch(wellKnownUrl, { signal: AbortSignal.timeout(10000) });

  if (!response.ok) {
    throw new Error(`OIDC discovery failed for ${issuerUrl}: ${response.status}`);
  }

  const doc = (await response.json()) as OIDCDiscovery;

  // Validate all endpoint hostnames match the issuer to prevent SSRF
  const issuerHost = new URL(issuerUrl).hostname;
  for (const key of ["authorization_endpoint", "token_endpoint", "userinfo_endpoint", "jwks_uri"] as const) {
    const endpoint = doc[key];
    if (endpoint) {
      const endpointHost = new URL(endpoint).hostname;
      if (endpointHost !== issuerHost && !endpointHost.endsWith(`.${issuerHost}`)) {
        throw new Error(
          `OIDC security: ${key} hostname "${endpointHost}" does not match issuer "${issuerHost}"`
        );
      }
    }
  }

  discoveryCache.set(issuerUrl, { doc, expiresAt: Date.now() + 3600000 }); // Cache 1 hour
  return doc;
}

// ── Authorization URL ──────────────────────────────────────────────────

export async function buildAuthorizationUrl(
  config: OIDCConfig,
  state: string,
  codeChallenge: string
): Promise<string> {
  const discovery = await discoverOIDCEndpoints(config.issuerUrl);
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.callbackUrl,
    scope: config.scopes,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });

  return `${discovery.authorization_endpoint}?${params.toString()}`;
}

// ── Token Exchange ─────────────────────────────────────────────────────

export async function exchangeCodeForTokens(
  config: OIDCConfig,
  code: string,
  codeVerifier: string
): Promise<OIDCTokens> {
  const discovery = await discoverOIDCEndpoints(config.issuerUrl);

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.callbackUrl,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code_verifier: codeVerifier,
  });

  const response = await fetch(discovery.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${error}`);
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    idToken: data.id_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

// ── User Info ──────────────────────────────────────────────────────────

export async function fetchUserInfo(
  issuerUrl: string,
  accessToken: string
): Promise<OIDCUserInfo> {
  const discovery = await discoverOIDCEndpoints(issuerUrl);

  const response = await fetch(discovery.userinfo_endpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`UserInfo fetch failed: ${response.status}`);
  }

  return response.json() as Promise<OIDCUserInfo>;
}
