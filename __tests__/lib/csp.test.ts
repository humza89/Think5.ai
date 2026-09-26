/**
 * lib/csp — route → policy mode, nonce generation and the app policy shape
 * (Issue #14).
 */

import { describe, expect, it } from "vitest";
import {
  PUBLIC_PAGE_PREFIXES,
  SPLINE_EMBED_CSP,
  buildApiCsp,
  buildAppCsp,
  buildLandingCsp,
  cspModeFor,
  generateCspNonce,
  supabaseOriginSources,
} from "@/lib/csp";

function directive(csp: string, name: string): string {
  const found = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${name} `) || d === name);
  if (!found) throw new Error(`missing directive ${name} in: ${csp}`);
  return found;
}

describe("cspModeFor", () => {
  it("routes app surfaces, including shared reports and dynamic routes, to the nonce policy", () => {
    for (const path of [
      "/dashboard",
      "/candidates",
      "/candidates/abc",
      "/candidate/dashboard",
      "/admin",
      "/interviews/abc",
      "/interview/accept",
      "/interview/xyz",
      "/jobs/123",
      "/reports/shared/token",
      "/recruiter/onboarding",
      "/settings",
    ]) {
      expect(cspModeFor(path), path).toBe("app");
    }
  });

  it("keeps the landing, public marketing/auth pages and the Spline embed on their static policies", () => {
    expect(cspModeFor("/")).toBe("landing");
    expect(cspModeFor("/spline-embed")).toBe("spline");
    for (const prefix of PUBLIC_PAGE_PREFIXES) {
      expect(cspModeFor(prefix), prefix).toBe("public");
      expect(cspModeFor(`${prefix}/deeper`), prefix).toBe("public");
    }
    expect(cspModeFor("/auth/signin")).toBe("public");
  });

  it("is segment-aware: /about-us or /authors are app routes, not marketing pages", () => {
    expect(cspModeFor("/about-us")).toBe("app");
    expect(cspModeFor("/authors")).toBe("app");
    expect(cspModeFor("/contacts")).toBe("app");
  });

  it("leaves API routes and static assets alone", () => {
    expect(cspModeFor("/api/interviews/1")).toBe("api");
    expect(cspModeFor("/_next/static/chunks/main.js")).toBe("asset");
    expect(cspModeFor("/favicon.ico")).toBe("asset");
    expect(cspModeFor("/Logos/acme.png")).toBe("asset");
    expect(cspModeFor("/robots.txt")).toBe("asset");
  });
});

describe("generateCspNonce", () => {
  it("produces 128-bit base64 nonces that differ per call", () => {
    const a = generateCspNonce();
    const b = generateCspNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(a).not.toBe(b);
    expect(Buffer.from(a, "base64")).toHaveLength(16);
  });
});

describe("buildAppCsp", () => {
  const nonce = generateCspNonce();
  const csp = buildAppCsp(nonce, "https://project.supabase.co");

  it("uses nonce + strict-dynamic and nothing else for script-src", () => {
    expect(directive(csp, "script-src")).toBe(`script-src 'nonce-${nonce}' 'strict-dynamic'`);
    expect(directive(csp, "script-src")).not.toContain("'unsafe-inline'");
    expect(directive(csp, "script-src")).not.toContain("'unsafe-eval'");
  });

  it("keeps every other directive identical to the static strict policy", () => {
    const api = buildApiCsp("https://project.supabase.co");
    const strip = (value: string) => value.split(";").map((d) => d.trim()).filter((d) => !d.startsWith("script-src"));
    expect(strip(csp)).toEqual(strip(api));
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(csp, "report-uri")).toBe("report-uri /api/csp-report");
    expect(directive(csp, "style-src")).toBe("style-src 'self' 'unsafe-inline'");
    expect(directive(csp, "connect-src")).toContain("wss://think5-voice-relay.fly.dev");
  });

  it("rejects a nonce that could break out of the directive", () => {
    expect(() => buildAppCsp("short")).toThrow(/base64/);
    expect(() => buildAppCsp("abcdefghijklmnop' 'unsafe-inline")).toThrow(/base64/);
  });

  it("adds a self-hosted Supabase origin only when the URL is not a hosted project", () => {
    expect(supabaseOriginSources("https://project.supabase.co")).toBe("");
    expect(supabaseOriginSources("http://127.0.0.1:54321")).toBe(" http://127.0.0.1:54321 ws://127.0.0.1:54321");
    expect(supabaseOriginSources(undefined)).toBe("");
    expect(directive(buildAppCsp(nonce, "http://127.0.0.1:54321"), "connect-src")).toContain("http://127.0.0.1:54321");
  });
});

describe("static policies", () => {
  it("landing/public pages keep script-src 'self' 'unsafe-inline' (documented, cacheable)", () => {
    expect(directive(buildLandingCsp("https://project.supabase.co"), "script-src")).toBe("script-src 'self' 'unsafe-inline'");
    expect(buildLandingCsp(undefined)).not.toContain("nonce");
  });

  it("only the Spline embed allows unsafe-eval", () => {
    expect(SPLINE_EMBED_CSP).toContain("'unsafe-eval'");
    expect(buildApiCsp(undefined)).not.toContain("'unsafe-eval'");
    expect(buildLandingCsp(undefined)).not.toContain("'unsafe-eval'");
    expect(buildAppCsp(generateCspNonce(), undefined)).not.toContain("'unsafe-eval'");
  });
});

describe("configuration wiring (source-level)", () => {
  it("next.config sets no static CSP on app page routes and proxy.ts applies the nonce policy", async () => {
    const { readFileSync } = await import("node:fs");
    const config = readFileSync("next.config.ts", "utf8");
    const proxy = readFileSync("proxy.ts", "utf8");
    expect(config).not.toMatch(/strictCsp/);
    expect(config).toMatch(/source: "\/api\/\(\.\*\)",\s*headers: \[\s*\.\.\.securityHeaders,\s*\{ key: "Content-Security-Policy", value: apiCsp \}/);
    expect(config).toMatch(/source: "\/\(interview\|candidate\|admin\|dashboard\)\(\.\*\)",\s*headers: securityHeaders,/);
    expect(proxy).toMatch(/request\.headers\.set\(CSP_HEADER, csp\)/);
    expect(proxy).toMatch(/response\.headers\.set\(CSP_HEADER, csp\)/);
    // Every NextResponse.next() forwards the request so the nonce headers reach the renderer.
    expect(proxy).not.toMatch(/(return|=)\s*NextResponse\.next\(\)\s*;/);
  });
});
