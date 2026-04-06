import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  buildAuthorizationUrl,
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  type OIDCConfig,
} from "@/lib/sso/oidc-provider";
import {
  buildAuthnRequest,
  type SAMLConfig,
} from "@/lib/sso/saml-provider";
import { cookies } from "next/headers";

const SSO_STATE_COOKIE = "sso-state";
const SSO_VERIFIER_COOKIE = "sso-code-verifier";
const SSO_PROVIDER_COOKIE = "sso-provider";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const SP_ENTITY_ID = `${APP_URL}/api/auth/sso`;

/**
 * GET /api/auth/sso?email=user@company.com
 *
 * Phase 1: Check if SSO is configured (email only)
 * Phase 2: Initiate SSO flow (email + action=login)
 */
export async function GET(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    const { allowed } = await checkRateLimit(`sso-lookup:${ip}`, { maxRequests: 10, windowMs: 60000 });
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");
    const action = searchParams.get("action"); // "check" (default) or "login"

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "email query parameter is required" }, { status: 400 });
    }

    const emailParts = email.split("@");
    if (emailParts.length !== 2 || !emailParts[1]) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }

    const domain = emailParts[1].toLowerCase();

    const ssoConfig = await prisma.sSOConfig.findFirst({
      where: { domain, enabled: true },
    });

    // Phase 1: Just check if SSO exists
    if (action !== "login") {
      if (!ssoConfig) {
        return NextResponse.json({ ssoEnabled: false });
      }
      return NextResponse.json({
        ssoEnabled: true,
        provider: ssoConfig.provider,
      });
    }

    // Phase 2: Initiate SSO login flow
    if (!ssoConfig) {
      return NextResponse.json({ error: "SSO not configured for this domain" }, { status: 404 });
    }

    const cookieStore = await cookies();

    if (ssoConfig.provider === "oidc") {
      if (!ssoConfig.clientId || !ssoConfig.clientSecret || !ssoConfig.issuerUrl) {
        return NextResponse.json({ error: "OIDC configuration incomplete" }, { status: 500 });
      }

      const oidcConfig: OIDCConfig = {
        clientId: ssoConfig.clientId,
        clientSecret: ssoConfig.clientSecret,
        issuerUrl: ssoConfig.issuerUrl,
        callbackUrl: ssoConfig.callbackUrl || `${APP_URL}/api/auth/sso/callback`,
        scopes: ssoConfig.scopes,
      };

      const state = generateState();
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier);

      const authUrl = await buildAuthorizationUrl(oidcConfig, state, codeChallenge);

      // Store PKCE verifier and state in secure cookies
      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax" as const,
        path: "/",
        maxAge: 600, // 10 minutes
      };

      cookieStore.set(SSO_STATE_COOKIE, state, cookieOptions);
      cookieStore.set(SSO_VERIFIER_COOKIE, codeVerifier, cookieOptions);
      cookieStore.set(SSO_PROVIDER_COOKIE, "oidc", cookieOptions);

      return NextResponse.json({ redirectUrl: authUrl });
    }

    if (ssoConfig.provider === "saml") {
      if (!ssoConfig.entityId || !ssoConfig.ssoUrl || !ssoConfig.certificate) {
        return NextResponse.json({ error: "SAML configuration incomplete" }, { status: 500 });
      }

      const samlConfig: SAMLConfig = {
        entityId: ssoConfig.entityId,
        ssoUrl: ssoConfig.ssoUrl,
        certificate: ssoConfig.certificate,
        callbackUrl: ssoConfig.callbackUrl || `${APP_URL}/api/auth/sso/callback`,
        nameIdFormat: ssoConfig.nameIdFormat || "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
      };

      const { requestId, samlRequest, relayState } = buildAuthnRequest(samlConfig, SP_ENTITY_ID);

      // Store state in cookies
      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax" as const,
        path: "/",
        maxAge: 600,
      };

      cookieStore.set(SSO_STATE_COOKIE, relayState, cookieOptions);
      cookieStore.set(SSO_PROVIDER_COOKIE, "saml", cookieOptions);
      cookieStore.set("sso-request-id", requestId, cookieOptions);

      // Return SAML POST binding data
      return NextResponse.json({
        samlRequest,
        relayState,
        ssoUrl: samlConfig.ssoUrl,
        // Client renders an auto-submitting form to the IdP
      });
    }

    return NextResponse.json({ error: "Unknown SSO provider" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
