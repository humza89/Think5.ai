import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSupabaseAdminClient } from "@/lib/supabase-server";
import { cookies } from "next/headers";
import { exchangeCodeForTokens, fetchUserInfo, type OIDCConfig } from "@/lib/sso/oidc-provider";
import { validateSAMLResponse, hashSAMLResponse, SAMLValidationError } from "@/lib/sso/saml-provider";
import { logActivity } from "@/lib/activity-log";
import { safeRedirectPath } from "@/lib/auth-errors";
import * as Sentry from "@sentry/nextjs";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const SP_ENTITY_ID = `${APP_URL}/api/auth/sso`;
const SSO_COOKIES = ["sso-state", "sso-code-verifier", "sso-provider", "sso-domain", "sso-request-id", "sso-redirect"];

/**
 * Phase 0 T9: SSO session completion.
 *
 * Both bindings end the same way: the identity is provisioned or matched
 * through the Supabase *admin* client (the anon/cookie client cannot call
 * auth.admin.*, which is why SSO never completed before), a magic-link token
 * hash is minted, and the browser is sent to /auth/verify, which exchanges it
 * with supabase.auth.verifyOtp and routes by role. Failures land on
 * /auth/error?code=… with human-readable copy.
 */
function fail(code: string): NextResponse {
  return NextResponse.redirect(`${APP_URL}/auth/error?code=${encodeURIComponent(code)}`);
}

async function clearSsoCookies(): Promise<void> {
  const store = await cookies();
  for (const name of SSO_COOKIES) store.delete(name);
}

interface SsoIdentity {
  email: string;
  fullName?: string;
  avatarUrl?: string;
  provider: "oidc" | "saml";
  subject: string;
}

/** Match or create the Supabase user, then mint a magic-link token hash. */
export async function completeSsoSession(identity: SsoIdentity, meta: { domain: string; companyId: string; responseHash?: string }): Promise<{ redirect: string } | { errorCode: string }> {
  const admin = await createSupabaseAdminClient();
  const email = identity.email.toLowerCase();

  // generateLink works for an existing user; for a new one we create first.
  let link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  let userId = link.data?.user?.id ?? null;
  if (link.error || !userId) {
    const created = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        full_name: identity.fullName || undefined,
        avatar_url: identity.avatarUrl || undefined,
        role: "recruiter", // SSO domains belong to a client company; the profile trigger reads this
        sso_provider: identity.provider,
        sso_sub: identity.subject,
        sso_company_id: meta.companyId,
      },
    });
    if (created.error || !created.data.user) {
      Sentry.captureException(created.error ?? new Error("SSO createUser returned no user"));
      return { errorCode: identity.provider === "saml" ? "saml_create_failed" : "sso_create_failed" };
    }
    userId = created.data.user.id;
    link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  }
  const tokenHash = link.data?.properties?.hashed_token;
  if (link.error || !tokenHash) {
    Sentry.captureException(link.error ?? new Error("SSO generateLink returned no token"));
    return { errorCode: identity.provider === "saml" ? "saml_link_failed" : "sso_link_failed" };
  }

  await logActivity({
    userId,
    userRole: "unknown", // resolved by profile after verification
    action: "auth.sso_login",
    entityType: "User",
    entityId: userId,
    metadata: { provider: identity.provider, domain: meta.domain, companyId: meta.companyId, ...(meta.responseHash ? { responseHash: meta.responseHash } : {}) },
  }).catch(() => {});

  const store = await cookies();
  const redirectTo = safeRedirectPath(store.get("sso-redirect")?.value, "");
  const verify = new URL(`${APP_URL}/auth/verify`);
  verify.searchParams.set("token_hash", tokenHash);
  verify.searchParams.set("type", "magiclink");
  if (redirectTo) verify.searchParams.set("redirectTo", redirectTo);
  return { redirect: verify.toString() };
}

/** GET /api/auth/sso/callback?code=…&state=… — OIDC authorization-code callback. */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");
    if (error) return fail(error === "access_denied" ? "sso_access_denied" : `sso_${error}`);
    if (!code || !state) return fail("sso_missing_params");

    const cookieStore = await cookies();
    const savedState = cookieStore.get("sso-state")?.value;
    const codeVerifier = cookieStore.get("sso-code-verifier")?.value;
    const provider = cookieStore.get("sso-provider")?.value;
    const domain = cookieStore.get("sso-domain")?.value;
    if (!savedState || savedState !== state) return fail("sso_state_mismatch");
    if (provider !== "oidc" || !codeVerifier) return fail("sso_invalid_session");
    if (!domain) return fail("sso_no_domain");

    const ssoConfig = await prisma.sSOConfig.findFirst({ where: { domain, enabled: true } });
    if (!ssoConfig || !ssoConfig.clientId || !ssoConfig.clientSecret || !ssoConfig.issuerUrl) return fail("sso_config_missing");

    const oidcConfig: OIDCConfig = {
      clientId: ssoConfig.clientId,
      clientSecret: ssoConfig.clientSecret,
      issuerUrl: ssoConfig.issuerUrl,
      callbackUrl: ssoConfig.callbackUrl || `${APP_URL}/api/auth/sso/callback`,
      scopes: ssoConfig.scopes,
    };
    const tokens = await exchangeCodeForTokens(oidcConfig, code, codeVerifier);
    const userInfo = await fetchUserInfo(oidcConfig.issuerUrl, tokens.accessToken);
    if (!userInfo.email) return fail("sso_no_email");

    const result = await completeSsoSession(
      {
        email: userInfo.email,
        fullName: userInfo.name || `${userInfo.given_name || ""} ${userInfo.family_name || ""}`.trim() || undefined,
        avatarUrl: userInfo.picture,
        provider: "oidc",
        subject: userInfo.sub,
      },
      { domain, companyId: ssoConfig.companyId },
    );
    await clearSsoCookies();
    return "errorCode" in result ? fail(result.errorCode) : NextResponse.redirect(result.redirect);
  } catch (error) {
    Sentry.captureException(error);
    return fail("sso_unexpected");
  }
}

/** POST /api/auth/sso/callback — SAML HTTP-POST binding (ACS). */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const samlResponse = formData.get("SAMLResponse");
    const relayState = formData.get("RelayState");
    if (typeof samlResponse !== "string" || !samlResponse) return fail("saml_no_response");

    const cookieStore = await cookies();
    const savedState = cookieStore.get("sso-state")?.value;
    const provider = cookieStore.get("sso-provider")?.value;
    const domain = cookieStore.get("sso-domain")?.value;
    const requestId = cookieStore.get("sso-request-id")?.value;
    if (!savedState || savedState !== relayState) return fail("saml_state_mismatch");
    if (provider !== "saml" || !requestId) return fail("saml_invalid_session");
    if (!domain) return fail("saml_no_domain");

    const ssoConfig = await prisma.sSOConfig.findFirst({ where: { domain, enabled: true } });
    if (!ssoConfig || !ssoConfig.certificate) return fail("saml_config_missing");

    let assertion;
    try {
      assertion = await validateSAMLResponse({
        samlResponse,
        certificate: ssoConfig.certificate,
        spEntityId: SP_ENTITY_ID,
        callbackUrl: ssoConfig.callbackUrl || `${APP_URL}/api/auth/sso/callback`,
        expectedRequestId: requestId,
      });
    } catch (err) {
      if (err instanceof SAMLValidationError) {
        await logActivity({ userId: "anonymous", userRole: "unknown", action: "auth.saml_rejected", entityType: "SSOConfig", entityId: ssoConfig.id, metadata: { domain, reason: err.message, responseHash: hashSAMLResponse(samlResponse) } }).catch(() => {});
        return fail("saml_invalid_response");
      }
      throw err;
    }
    if (!assertion.email) return fail("saml_no_email");

    const result = await completeSsoSession(
      {
        email: assertion.email,
        fullName: `${assertion.firstName || ""} ${assertion.lastName || ""}`.trim() || undefined,
        provider: "saml",
        subject: assertion.nameId,
      },
      { domain, companyId: ssoConfig.companyId, responseHash: hashSAMLResponse(samlResponse) },
    );
    await clearSsoCookies();
    return "errorCode" in result ? fail(result.errorCode) : NextResponse.redirect(result.redirect);
  } catch (error) {
    Sentry.captureException(error);
    return fail("saml_unexpected");
  }
}
