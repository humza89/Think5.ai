/**
 * Human-readable copy for authentication error codes (Phase 0 T9).
 * Shared by /auth/error and the sign-in page banner. Browser-safe.
 */
export interface AuthErrorInfo {
  title: string;
  description: string;
  contactSupport?: boolean;
}

const MESSAGES: Record<string, AuthErrorInfo> = {
  // SSO (OIDC)
  sso_missing_params: { title: "Sign-in could not be completed", description: "Your identity provider did not return the details we need. Please start again from the sign-in page." },
  sso_state_mismatch: { title: "Sign-in session expired", description: "The single sign-on session did not match this browser. Please start again." },
  sso_invalid_session: { title: "Sign-in session expired", description: "The single sign-on session expired or was opened in a different browser. Please start again." },
  sso_no_domain: { title: "Sign-in session expired", description: "We could not tell which organisation you were signing in to. Please start again." },
  sso_config_missing: { title: "Single sign-on is not set up", description: "Your organisation's single sign-on configuration is incomplete. Ask your administrator to finish it in Settings → SSO.", contactSupport: true },
  sso_no_email: { title: "No email from your identity provider", description: "Your identity provider did not share an email address. Ask your administrator to release the email claim.", contactSupport: true },
  sso_signin_failed: { title: "Sign-in failed", description: "We could not create a session for your account. Please try again.", contactSupport: true },
  sso_create_failed: { title: "Account could not be created", description: "We could not create your account from your identity provider's details.", contactSupport: true },
  sso_link_failed: { title: "Sign-in failed", description: "We could not complete your single sign-on session. Please try again.", contactSupport: true },
  sso_unexpected: { title: "Something went wrong", description: "An unexpected error interrupted single sign-on. Please try again.", contactSupport: true },
  sso_access_denied: { title: "Access denied by your identity provider", description: "Your identity provider declined the sign-in. Check with your administrator that you are assigned to this application." },
  // SSO (SAML)
  saml_no_response: { title: "Sign-in could not be completed", description: "Your identity provider did not return a SAML response. Please start again." },
  saml_state_mismatch: { title: "Sign-in session expired", description: "The single sign-on session did not match this browser. Please start again." },
  saml_invalid_session: { title: "Sign-in session expired", description: "The single sign-on session expired or was opened in a different browser. Please start again." },
  saml_no_domain: { title: "Sign-in session expired", description: "We could not tell which organisation you were signing in to. Please start again." },
  saml_config_missing: { title: "Single sign-on is not set up", description: "Your organisation's SAML configuration is incomplete. Ask your administrator to finish it in Settings → SSO.", contactSupport: true },
  saml_invalid_response: { title: "SAML response rejected", description: "The response from your identity provider failed signature, audience or timing validation. Ask your administrator to check the SAML configuration.", contactSupport: true },
  saml_no_email: { title: "No email from your identity provider", description: "Your identity provider did not include an email address in the SAML assertion.", contactSupport: true },
  saml_create_failed: { title: "Account could not be created", description: "We could not create your account from the SAML assertion.", contactSupport: true },
  saml_link_failed: { title: "Sign-in failed", description: "We could not complete your single sign-on session. Please try again.", contactSupport: true },
  saml_unexpected: { title: "Something went wrong", description: "An unexpected error interrupted SAML sign-in. Please try again.", contactSupport: true },
  // Verification
  verify_failed: { title: "Link could not be verified", description: "This sign-in link is invalid or has expired. Please sign in again to receive a new one." },
  verify_missing: { title: "Missing sign-in link", description: "The sign-in link was incomplete. Please sign in again." },
  // Account state
  account_suspended: { title: "Account suspended", description: "Your account has been suspended. Contact support to restore access.", contactSupport: true },
  account_deactivated: { title: "Account deactivated", description: "Your account has been deactivated. Contact support if you believe this is a mistake.", contactSupport: true },
  mfa_required: { title: "Two-factor verification required", description: "Your role requires two-factor authentication. Sign in and complete the verification step to continue." },
};

const FALLBACK: AuthErrorInfo = { title: "Something went wrong", description: "We could not complete your sign-in. Please try again.", contactSupport: true };

export function authErrorMessage(code: string | null | undefined): AuthErrorInfo {
  if (!code) return FALLBACK;
  return MESSAGES[code] ?? FALLBACK;
}

/** Only same-origin paths are honoured as post-sign-in destinations. */
export function safeRedirectPath(value: string | null | undefined, fallback = "/"): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/[\r\n]/.test(value)) return fallback;
  return value;
}

/** Where a role lands after sign-in when no redirectTo was requested. */
export function roleHomePath(role: string | null | undefined): string {
  switch (role) {
    case "candidate":
      return "/candidate/dashboard";
    case "admin":
      return "/admin";
    default:
      return "/dashboard";
  }
}
