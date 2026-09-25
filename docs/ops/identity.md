# Identity: SSO sessions, MFA and security settings (Phase 0 · T9)

## What changed

- **SSO completes a session.** Both bindings finish through the Supabase
  *admin* client (`createSupabaseAdminClient`): match-or-create the user, mint
  a magic-link token hash, redirect to `/auth/verify?token_hash=…&type=magiclink`.
  The verify page calls `supabase.auth.verifyOtp` in the browser (so the auth
  cookies are set) and routes by role or to a same-origin `redirectTo`.
  Failures land on `/auth/error?code=…` (`lib/auth-errors.ts` has the copy).
- **SAML is validated by `@node-saml/node-saml`**: signature and digest
  (assertion must be signed), Conditions (NotBefore/NotOnOrAfter, 5 s skew),
  AudienceRestriction (`<APP_URL>/api/auth/sso`), Destination (ACS URL) and
  `InResponseTo` against the request id stored in the `sso-request-id` cookie
  when the flow started. OIDC keeps PKCE + state and userinfo.
- **Native Supabase TOTP MFA**: `/api/auth/mfa/{status,enroll,verify,challenge,recover,factor}`.
  Recovery codes are stored hashed in `MfaRecoveryCode`; a code is a one-time
  *reset* (deletes the user's factors) because Supabase has no native
  recovery-code concept.
- **Policy** (`lib/mfa.ts`): mandatory for `admin` and for recruiters with
  `Recruiter.isTenantAdmin`; tenant-configurable for other recruiters and
  hiring managers via `GovernancePolicy.requireMfa`; optional for candidates.
- **Enforcement** is server-side in `requireRole` (403 `MFA_REQUIRED` when the
  account has a factor but this session is `aal1`; 403 `MFA_ENROLLMENT_REQUIRED`
  when it has none) and mirrored by `MfaGate` inside `ProtectedRoute`, which
  shows enrolment or the challenge inline. Reachable at aal1 by design:
  `/api/auth/profile`, `/api/auth/mfa/*`, `/api/account/*` (they use
  `getAuthenticatedUser`, not `requireRole`).
- **`FF_P0_MFA_ENFORCEMENT` defaults off.** Turning it on immediately gates
  every admin and tenant admin. Rollout: enable in staging → every admin
  enrols on Settings → Security → enable in production. Until then the policy
  is visible (`/api/auth/mfa/status` reports `required` and `enforced`) but not
  blocking.
- **Security settings** are real: password change (`/api/account/password`
  re-authenticates with the current password, then `auth.updateUser`, then
  signs out other devices), sessions (`/api/account/sessions`: current session
  facts and "sign out other devices" — Supabase exposes no per-device
  listing), account deletion (`/api/account/delete`: 30-day-grace request;
  candidates reuse `DataDeletionRequest`, other roles get the additive
  `AccountDeletionRequest`; cancel with DELETE). `DELETE /api/candidate/settings`
  delegates to the same flow.
- **Sign-in page**: `?redirectTo=` (same-origin only), `?reason=account_suspended|deactivated`,
  `?error=<code>` banner, and "Continue with SSO" (email → `/api/auth/sso?action=check`
  → `action=login`; OIDC redirect or SAML auto-POST).

## Tenant admin bootstrap

`Recruiter.isTenantAdmin` is additive and defaults to `false`; existing tenants
have no owner flagged. Set it for the first recruiter of each company before
enabling enforcement (SQL or the admin UI in a later task):

```sql
UPDATE "Recruiter" r SET "isTenantAdmin" = true
WHERE r.id = (SELECT id FROM "Recruiter" WHERE "companyId" = r."companyId" ORDER BY "createdAt" ASC LIMIT 1);
```

New companies: the recruiter who creates the company should be flagged at
creation (follow-up in the onboarding route; not part of T9).

## Local / CI

`supabase/config.toml` enables `[auth.mfa.totp]` enrol + verify so the golden
E2E (`e2e/golden/writes-identity.spec.ts`) can enrol a real TOTP factor,
compute a code, reach `aal2`, and reset with a recovery code.

## Not in Phase 0

Org-wide "MFA or SSO required" (Phase 3), SCIM, per-device session listing,
execution of non-candidate deletion requests (admin runbook until Phase 1).
