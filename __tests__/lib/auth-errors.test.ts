import { describe, expect, it } from "vitest";
import { authErrorMessage, roleHomePath, safeRedirectPath } from "@/lib/auth-errors";

describe("auth-errors (T9)", () => {
  it("only honours same-origin paths as redirect targets", () => {
    expect(safeRedirectPath("/jobs?x=1", "/dashboard")).toBe("/jobs?x=1");
    expect(safeRedirectPath("https://evil.example/", "/dashboard")).toBe("/dashboard");
    expect(safeRedirectPath("//evil.example", "/dashboard")).toBe("/dashboard");
    expect(safeRedirectPath("/\\evil.example", "/dashboard")).toBe("/dashboard");
    expect(safeRedirectPath("/ok\r\nSet-Cookie: x", "/dashboard")).toBe("/dashboard");
    expect(safeRedirectPath(null, "/dashboard")).toBe("/dashboard");
    expect(safeRedirectPath("", "")).toBe("");
  });

  it("routes by role and falls back for unknown codes", () => {
    expect(roleHomePath("candidate")).toBe("/candidate/dashboard");
    expect(roleHomePath("admin")).toBe("/admin");
    expect(roleHomePath("recruiter")).toBe("/dashboard");
    expect(roleHomePath(null)).toBe("/dashboard");
    expect(authErrorMessage("account_suspended").title).toMatch(/suspended/i);
    expect(authErrorMessage("saml_invalid_response").contactSupport).toBe(true);
    expect(authErrorMessage("nope").title).toBe("Something went wrong");
  });
});
