/**
 * SSO callback (T9): OIDC and SAML both complete a session through the
 * Supabase admin client and land on /auth/verify with a token hash; failures
 * land on /auth/error with a code. External IdPs, Prisma and Supabase are
 * mocked; the SAML validator is exercised separately in lib/saml-provider.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
    set: (name: string, value: string) => void cookieJar.set(name, value),
    delete: (name: string) => void cookieJar.delete(name),
    getAll: () => [...cookieJar].map(([name, value]) => ({ name, value })),
  }),
}));

const ssoConfig = { id: "sso-1", companyId: "co-1", domain: "northwind.test", enabled: true, provider: "oidc", clientId: "cid", clientSecret: "sec", issuerUrl: "https://idp.test", callbackUrl: null, scopes: "openid email profile", certificate: "CERT" };
vi.mock("@/lib/prisma", () => ({ prisma: { sSOConfig: { findFirst: vi.fn(async () => ssoConfig) } } }));

const admin = {
  generateLink: vi.fn(),
  createUser: vi.fn(),
};
vi.mock("@/lib/supabase-server", () => ({ createSupabaseAdminClient: async () => ({ auth: { admin } }) }));

const oidc = { exchangeCodeForTokens: vi.fn(async () => ({ accessToken: "at", idToken: "idt" })), fetchUserInfo: vi.fn(async () => ({ sub: "sub-1", email: "Riley@Northwind.test", name: "Riley Chen" })) };
vi.mock("@/lib/sso/oidc-provider", () => ({ exchangeCodeForTokens: (...a: unknown[]) => oidc.exchangeCodeForTokens(...(a as [])), fetchUserInfo: (...a: unknown[]) => oidc.fetchUserInfo(...(a as [])) }));

const saml = { validate: vi.fn() };
vi.mock("@/lib/sso/saml-provider", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/sso/saml-provider")>();
  return { ...mod, validateSAMLResponse: (...a: unknown[]) => saml.validate(...(a as [])) };
});

const activity = vi.fn(async () => {});
vi.mock("@/lib/activity-log", () => ({ logActivity: (...a: unknown[]) => activity(...(a as [])) }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { GET, POST } from "@/app/api/auth/sso/callback/route";
import { NextRequest } from "next/server";

function existingUserLink() {
  admin.generateLink.mockResolvedValue({ data: { user: { id: "user-1" }, properties: { hashed_token: "hash-abc" } }, error: null });
}

describe("SSO callback (T9)", () => {
  beforeEach(() => {
    cookieJar.clear();
    admin.generateLink.mockReset();
    admin.createUser.mockReset();
    saml.validate.mockReset();
    activity.mockClear();
    ssoConfig.provider = "oidc";
  });

  it("OIDC: completes the session for an existing user and forwards the stored redirectTo", async () => {
    existingUserLink();
    cookieJar.set("sso-state", "st");
    cookieJar.set("sso-code-verifier", "ver");
    cookieJar.set("sso-provider", "oidc");
    cookieJar.set("sso-domain", "northwind.test");
    cookieJar.set("sso-redirect", "/jobs");
    const res = await GET(new NextRequest("http://localhost:3000/api/auth/sso/callback?code=abc&state=st"));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/auth/verify");
    expect(location.searchParams.get("token_hash")).toBe("hash-abc");
    expect(location.searchParams.get("type")).toBe("magiclink");
    expect(location.searchParams.get("redirectTo")).toBe("/jobs");
    expect(admin.generateLink).toHaveBeenCalledWith({ type: "magiclink", email: "riley@northwind.test" });
    expect(admin.createUser).not.toHaveBeenCalled();
    expect(activity).toHaveBeenCalledWith(expect.objectContaining({ action: "auth.sso_login", userId: "user-1" }));
    expect(cookieJar.size).toBe(0); // every sso-* cookie cleared
  });

  it("OIDC: provisions an unknown user as a recruiter, then mints the link", async () => {
    admin.generateLink
      .mockResolvedValueOnce({ data: null, error: { message: "User not found" } })
      .mockResolvedValueOnce({ data: { user: { id: "user-new" }, properties: { hashed_token: "hash-new" } }, error: null });
    admin.createUser.mockResolvedValue({ data: { user: { id: "user-new" } }, error: null });
    for (const [k, v] of [["sso-state", "st"], ["sso-code-verifier", "ver"], ["sso-provider", "oidc"], ["sso-domain", "northwind.test"]]) cookieJar.set(k, v);
    const res = await GET(new NextRequest("http://localhost:3000/api/auth/sso/callback?code=abc&state=st"));
    expect(new URL(res.headers.get("location")!).searchParams.get("token_hash")).toBe("hash-new");
    expect(admin.createUser).toHaveBeenCalledWith(expect.objectContaining({ email: "riley@northwind.test", email_confirm: true, user_metadata: expect.objectContaining({ role: "recruiter", sso_provider: "oidc", sso_sub: "sub-1", sso_company_id: "co-1" }) }));
  });

  it("OIDC: rejects a state mismatch and an IdP error with error-page codes", async () => {
    cookieJar.set("sso-state", "st");
    const mismatch = await GET(new NextRequest("http://localhost:3000/api/auth/sso/callback?code=abc&state=other"));
    expect(new URL(mismatch.headers.get("location")!).searchParams.get("code")).toBe("sso_state_mismatch");
    expect(new URL(mismatch.headers.get("location")!).pathname).toBe("/auth/error");
    const denied = await GET(new NextRequest("http://localhost:3000/api/auth/sso/callback?error=access_denied"));
    expect(new URL(denied.headers.get("location")!).searchParams.get("code")).toBe("sso_access_denied");
    expect(admin.generateLink).not.toHaveBeenCalled();
  });

  it("SAML: validates with the stored request id and completes the session", async () => {
    ssoConfig.provider = "saml";
    existingUserLink();
    saml.validate.mockResolvedValue({ nameId: "riley@northwind.test", email: "riley@northwind.test", firstName: "Riley", lastName: "Chen", attributes: {} });
    for (const [k, v] of [["sso-state", "relay"], ["sso-provider", "saml"], ["sso-domain", "northwind.test"], ["sso-request-id", "_req1"]]) cookieJar.set(k, v);
    const form = new FormData();
    form.set("SAMLResponse", "BASE64");
    form.set("RelayState", "relay");
    const res = await POST(new NextRequest("http://localhost:3000/api/auth/sso/callback", { method: "POST", body: form }));
    expect(new URL(res.headers.get("location")!).pathname).toBe("/auth/verify");
    expect(saml.validate).toHaveBeenCalledWith(expect.objectContaining({ samlResponse: "BASE64", certificate: "CERT", expectedRequestId: "_req1", spEntityId: "http://localhost:3000/api/auth/sso" }));
    expect(activity).toHaveBeenCalledWith(expect.objectContaining({ action: "auth.sso_login", metadata: expect.objectContaining({ provider: "saml", responseHash: expect.any(String) }) }));
  });

  it("SAML: a rejected response lands on /auth/error and is audited; a missing request id is an invalid session", async () => {
    ssoConfig.provider = "saml";
    const mod = await import("@/lib/sso/saml-provider");
    saml.validate.mockRejectedValue(new mod.SAMLValidationError("InResponseTo mismatch"));
    for (const [k, v] of [["sso-state", "relay"], ["sso-provider", "saml"], ["sso-domain", "northwind.test"], ["sso-request-id", "_req1"]]) cookieJar.set(k, v);
    const form = new FormData();
    form.set("SAMLResponse", "BASE64");
    form.set("RelayState", "relay");
    const res = await POST(new NextRequest("http://localhost:3000/api/auth/sso/callback", { method: "POST", body: form }));
    expect(new URL(res.headers.get("location")!).searchParams.get("code")).toBe("saml_invalid_response");
    expect(activity).toHaveBeenCalledWith(expect.objectContaining({ action: "auth.saml_rejected" }));

    cookieJar.delete("sso-request-id");
    const noId = await POST(new NextRequest("http://localhost:3000/api/auth/sso/callback", { method: "POST", body: form }));
    expect(new URL(noId.headers.get("location")!).searchParams.get("code")).toBe("saml_invalid_session");
  });
});
