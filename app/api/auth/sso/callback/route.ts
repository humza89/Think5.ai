import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { cookies } from "next/headers";
import {
  exchangeCodeForTokens,
  fetchUserInfo,
  type OIDCConfig,
} from "@/lib/sso/oidc-provider";
import { parseSAMLResponse, hashSAMLResponse } from "@/lib/sso/saml-provider";
import { logActivity } from "@/lib/activity-log";
import * as Sentry from "@sentry/nextjs";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/**
 * GET /api/auth/sso/callback?code=...&state=...
 * Handles OIDC authorization code callback
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    if (error) {
      return NextResponse.redirect(
        `${APP_URL}/auth/signin?error=sso_${error}`
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        `${APP_URL}/auth/signin?error=sso_missing_params`
      );
    }

    const cookieStore = await cookies();
    const savedState = cookieStore.get("sso-state")?.value;
    const codeVerifier = cookieStore.get("sso-code-verifier")?.value;
    const provider = cookieStore.get("sso-provider")?.value;

    // Validate state parameter (CSRF protection)
    if (!savedState || savedState !== state) {
      return NextResponse.redirect(
        `${APP_URL}/auth/signin?error=sso_state_mismatch`
      );
    }

    if (provider !== "oidc" || !codeVerifier) {
      return NextResponse.redirect(
        `${APP_URL}/auth/signin?error=sso_invalid_session`
      );
    }

    // Find SSO config by looking up which domain initiated this flow
    // We need to find the config - extract from the issuer or use a stored domain cookie
    const domainCookie = cookieStore.get("sso-domain")?.value;
    if (!domainCookie) {
      return NextResponse.redirect(
        `${APP_URL}/auth/signin?error=sso_no_domain`
      );
    }

    const ssoConfig = await prisma.sSOConfig.findFirst({
      where: { domain: domainCookie, enabled: true },
    });

    if (!ssoConfig || !ssoConfig.clientId || !ssoConfig.clientSecret || !ssoConfig.issuerUrl) {
      return NextResponse.redirect(
        `${APP_URL}/auth/signin?error=sso_config_missing`
      );
    }

    const oidcConfig: OIDCConfig = {
      clientId: ssoConfig.clientId,
      clientSecret: ssoConfig.clientSecret,
      issuerUrl: ssoConfig.issuerUrl,
      callbackUrl: ssoConfig.callbackUrl || `${APP_URL}/api/auth/sso/callback`,
      scopes: ssoConfig.scopes,
    };

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(oidcConfig, code, codeVerifier);
    const userInfo = await fetchUserInfo(oidcConfig.issuerUrl, tokens.accessToken);

    if (!userInfo.email) {
      return NextResponse.redirect(
        `${APP_URL}/auth/signin?error=sso_no_email`
      );
    }

    // Create or link user in Supabase
    const supabase = await createSupabaseServerClient();
    const { data: existingUser } = await supabase.auth.admin.listUsers();
    const existing = existingUser?.users?.find((u) => u.email === userInfo.email);

    let userId: string;

    if (existing) {
      // Sign in existing user
      const { data: session, error: signInError } =
        await supabase.auth.admin.generateLink({
          type: "magiclink",
          email: userInfo.email,
        });

      if (signInError || !session) {
        Sentry.captureException(signInError);
        return NextResponse.redirect(
          `${APP_URL}/auth/signin?error=sso_signin_failed`
        );
      }

      userId = existing.id;
    } else {
      // Create new user via Supabase
      const { data: newUser, error: createError } =
        await supabase.auth.admin.createUser({
          email: userInfo.email,
          email_confirm: true,
          user_metadata: {
            full_name: userInfo.name || `${userInfo.given_name || ""} ${userInfo.family_name || ""}`.trim(),
            avatar_url: userInfo.picture,
            sso_provider: "oidc",
            sso_sub: userInfo.sub,
          },
        });

      if (createError || !newUser.user) {
        Sentry.captureException(createError);
        return NextResponse.redirect(
          `${APP_URL}/auth/signin?error=sso_create_failed`
        );
      }

      userId = newUser.user.id;
    }

    // Audit log
    await logActivity({
      userId,
      userRole: "unknown", // Will be resolved by profile
      action: "auth.sso_login",
      entityType: "User",
      entityId: userId,
      metadata: {
        provider: "oidc",
        domain: domainCookie,
        companyId: ssoConfig.companyId,
      },
    });

    // Clear SSO cookies
    cookieStore.delete("sso-state");
    cookieStore.delete("sso-code-verifier");
    cookieStore.delete("sso-provider");
    cookieStore.delete("sso-domain");

    // Generate a magic link to sign the user in
    const { data: linkData, error: linkError } =
      await supabase.auth.admin.generateLink({
        type: "magiclink",
        email: userInfo.email,
      });

    if (linkError || !linkData) {
      return NextResponse.redirect(
        `${APP_URL}/auth/signin?error=sso_link_failed`
      );
    }

    // Redirect to the magic link verification endpoint
    const verifyUrl = new URL(linkData.properties.hashed_token
      ? `${APP_URL}/auth/verify?token_hash=${linkData.properties.hashed_token}&type=magiclink`
      : `${APP_URL}/auth/signin?success=sso`
    );

    return NextResponse.redirect(verifyUrl.toString());
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.redirect(
      `${APP_URL}/auth/signin?error=sso_unexpected`
    );
  }
}

/**
 * POST /api/auth/sso/callback
 * Handles SAML POST binding response
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const samlResponse = formData.get("SAMLResponse") as string;
    const relayState = formData.get("RelayState") as string;

    if (!samlResponse) {
      return NextResponse.redirect(
        `${APP_URL}/auth/signin?error=saml_no_response`
      );
    }

    const cookieStore = await cookies();
    const savedState = cookieStore.get("sso-state")?.value;
    const provider = cookieStore.get("sso-provider")?.value;

    // Validate relay state
    if (!savedState || savedState !== relayState) {
      return NextResponse.redirect(
        `${APP_URL}/auth/signin?error=saml_state_mismatch`
      );
    }

    if (provider !== "saml") {
      return NextResponse.redirect(
        `${APP_URL}/auth/signin?error=saml_invalid_session`
      );
    }

    const domainCookie = cookieStore.get("sso-domain")?.value;
    if (!domainCookie) {
      return NextResponse.redirect(
        `${APP_URL}/auth/signin?error=saml_no_domain`
      );
    }

    const ssoConfig = await prisma.sSOConfig.findFirst({
      where: { domain: domainCookie, enabled: true },
    });

    if (!ssoConfig || !ssoConfig.certificate) {
      return NextResponse.redirect(
        `${APP_URL}/auth/signin?error=saml_config_missing`
      );
    }

    // Parse and validate SAML response
    const assertion = parseSAMLResponse(samlResponse, ssoConfig.certificate);

    if (!assertion.email) {
      return NextResponse.redirect(
        `${APP_URL}/auth/signin?error=saml_no_email`
      );
    }

    // Create or link user in Supabase
    const supabase = await createSupabaseServerClient();
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existing = existingUsers?.users?.find((u) => u.email === assertion.email);

    let userId: string;

    if (existing) {
      userId = existing.id;
    } else {
      const { data: newUser, error: createError } =
        await supabase.auth.admin.createUser({
          email: assertion.email,
          email_confirm: true,
          user_metadata: {
            full_name: `${assertion.firstName || ""} ${assertion.lastName || ""}`.trim() || undefined,
            sso_provider: "saml",
            sso_name_id: assertion.nameId,
          },
        });

      if (createError || !newUser.user) {
        Sentry.captureException(createError);
        return NextResponse.redirect(
          `${APP_URL}/auth/signin?error=saml_create_failed`
        );
      }

      userId = newUser.user.id;
    }

    // Audit log
    await logActivity({
      userId,
      userRole: "unknown",
      action: "auth.sso_login",
      entityType: "User",
      entityId: userId,
      metadata: {
        provider: "saml",
        domain: domainCookie,
        companyId: ssoConfig.companyId,
        responseHash: hashSAMLResponse(samlResponse),
      },
    });

    // Clear SSO cookies
    cookieStore.delete("sso-state");
    cookieStore.delete("sso-provider");
    cookieStore.delete("sso-domain");
    cookieStore.delete("sso-request-id");

    // Generate magic link for session
    const { data: linkData, error: linkError } =
      await supabase.auth.admin.generateLink({
        type: "magiclink",
        email: assertion.email,
      });

    if (linkError || !linkData) {
      return NextResponse.redirect(
        `${APP_URL}/auth/signin?error=saml_link_failed`
      );
    }

    const verifyUrl = linkData.properties.hashed_token
      ? `${APP_URL}/auth/verify?token_hash=${linkData.properties.hashed_token}&type=magiclink`
      : `${APP_URL}/auth/signin?success=sso`;

    return NextResponse.redirect(verifyUrl);
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.redirect(
      `${APP_URL}/auth/signin?error=saml_unexpected`
    );
  }
}
