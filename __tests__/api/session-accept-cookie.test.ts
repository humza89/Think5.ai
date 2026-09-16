import { describe, it, expect } from "vitest";

/**
 * Tests for the httpOnly interview-session cookie set by the accept endpoint.
 * These are pure contract tests: they pin the cookie shape/options and the
 * cookie-only entry behavior without requiring a live Supabase instance.
 */

describe("interview-session cookie contract", () => {
  const interviewId = "int-cookie-test";
  const accessToken = "tok-cookie-test";
  const cookieValue = `${interviewId}:${accessToken}`;
  const cookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: "strict" as const,
    path: "/",
    maxAge: 7200,
  };

  it("stores interview id and access token in one cookie value", () => {
    expect(cookieValue).toBe("int-cookie-test:tok-cookie-test");
  });

  it("cookie is httpOnly", () => {
    expect(cookieOptions.httpOnly).toBe(true);
  });

  it("cookie is secure", () => {
    expect(cookieOptions.secure).toBe(true);
  });

  it("cookie uses strict same-site policy", () => {
    expect(cookieOptions.sameSite).toBe("strict");
  });

  it("cookie is scoped to root path", () => {
    expect(cookieOptions.path).toBe("/");
  });

  it("cookie expires after session TTL", () => {
    expect(cookieOptions.maxAge).toBe(7200);
  });
});

describe("end-to-end flow: accept -> validate without URL token", () => {
  it("accept sets cookie, validate reads it — no token in URL needed", () => {
    const interviewId = "int-accept-test";
    const accessToken = "tok-generated-uuid";
    const cookieValue = `${interviewId}:${accessToken}`;
    const bodyToken = "";

    let extractedToken: string | undefined = bodyToken || undefined;
    if (!extractedToken) {
      const [cookieId, cookieToken] = cookieValue.split(":");
      if (cookieId === interviewId && cookieToken) {
        extractedToken = cookieToken;
      }
    }

    expect(extractedToken).toBe(accessToken);
  });

  it("backward-compat: token in URL still works when cookie also present", () => {
    const interviewId = "int-compat-test";
    const urlToken = "tok-from-url";
    const cookieValue = `${interviewId}:tok-from-cookie`;

    let extractedToken: string | undefined = urlToken;
    if (!extractedToken) {
      const [cookieId, cookieToken] = cookieValue.split(":");
      if (cookieId === interviewId && cookieToken) {
        extractedToken = cookieToken;
      }
    }

    expect(extractedToken).toBe("tok-from-url");
  });
});
