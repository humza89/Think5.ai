import { describe, expect, it } from "vitest";
import {
  assertInterviewCredential,
  checkInterviewCredential,
  resolveInterviewCredential,
  tokenFromSessionCookie,
  type CredentialRequest,
} from "@/lib/interview-credential";

function req(opts: { authorization?: string; cookie?: string; query?: Record<string, string> } = {}): CredentialRequest {
  const params = new URLSearchParams(opts.query ?? {});
  return {
    headers: { get: (name: string) => (name.toLowerCase() === "authorization" ? (opts.authorization ?? null) : null) },
    cookies: { get: (name: string) => (name === "interview-session" && opts.cookie ? { value: opts.cookie } : undefined) },
    nextUrl: { searchParams: params },
  };
}

describe("resolveInterviewCredential", () => {
  it("reads the interview-session cookie for the same interview", () => {
    expect(resolveInterviewCredential(req({ cookie: "int-1:tok-a" }), "int-1")).toEqual({ token: "tok-a", source: "cookie" });
  });

  it("ignores a cookie issued for another interview", () => {
    expect(resolveInterviewCredential(req({ cookie: "int-2:tok-a" }), "int-1")).toBeNull();
  });

  it("keeps colons inside the token", () => {
    expect(tokenFromSessionCookie("int-1:a:b:c", "int-1")).toBe("a:b:c");
  });

  it("reads Authorization: Bearer", () => {
    expect(resolveInterviewCredential(req({ authorization: "Bearer tok-h" }), "int-1")).toEqual({ token: "tok-h", source: "header" });
    expect(resolveInterviewCredential(req({ authorization: "Basic xyz" }), "int-1")).toBeNull();
  });

  it("reads accessToken from a parsed JSON body", () => {
    expect(resolveInterviewCredential(req(), "int-1", { accessToken: "tok-b" })).toEqual({ token: "tok-b", source: "body" });
    expect(resolveInterviewCredential(req(), "int-1", { accessToken: "" })).toBeNull();
    expect(resolveInterviewCredential(req(), "int-1", "not-an-object")).toBeNull();
  });

  it("reads ?token= and ?accessToken=", () => {
    expect(resolveInterviewCredential(req({ query: { token: "tok-q" } }), "int-1")).toEqual({ token: "tok-q", source: "query" });
    expect(resolveInterviewCredential(req({ query: { accessToken: "tok-q2" } }), "int-1")).toEqual({ token: "tok-q2", source: "query" });
  });

  it("prefers explicit request credentials over the ambient cookie", () => {
    const r = req({ authorization: "Bearer tok-h", cookie: "int-1:tok-c", query: { token: "tok-q" } });
    expect(resolveInterviewCredential(r, "int-1", { accessToken: "tok-b" })).toEqual({ token: "tok-h", source: "header" });
    expect(resolveInterviewCredential(req({ cookie: "int-1:tok-c" }), "int-1", { accessToken: "tok-b" })).toEqual({ token: "tok-b", source: "body" });
    expect(resolveInterviewCredential(req({ cookie: "int-1:tok-c", query: { token: "tok-q" } }), "int-1")).toEqual({ token: "tok-q", source: "query" });
  });

  it("works with a plain Fetch Request (url query + Cookie header)", () => {
    const plain = new Request("http://localhost/api/interviews/int-1/voice?token=tok-q", {
      headers: { cookie: "csrf-token-client=x; interview-session=int-1%3Atok-c" },
    });
    expect(resolveInterviewCredential(plain, "int-1")).toEqual({ token: "tok-q", source: "query" });
    const cookieOnly = new Request("http://localhost/api/interviews/int-1/voice", {
      headers: { cookie: "interview-session=int-1:tok-c" },
    });
    expect(resolveInterviewCredential(cookieOnly, "int-1")).toEqual({ token: "tok-c", source: "cookie" });
    expect(resolveInterviewCredential(cookieOnly, "int-1", undefined, { allowCookie: false })).toBeNull();
  });

  it("returns null when nothing matches", () => {
    expect(resolveInterviewCredential(req(), "int-1")).toBeNull();
  });
});

describe("checkInterviewCredential / assertInterviewCredential", () => {
  const interview = { accessToken: "tok-a", accessTokenExpiresAt: new Date("2099-01-01T00:00:00Z") };

  it("accepts a matching, unexpired token", () => {
    expect(checkInterviewCredential(interview, { token: "tok-a", source: "cookie" })).toBeNull();
    expect(assertInterviewCredential(interview, { token: "tok-a", source: "cookie" })).toBeNull();
  });

  it("reports missing, mismatch and expired distinctly", async () => {
    expect(checkInterviewCredential(interview, null)).toBe("missing");
    expect(checkInterviewCredential(interview, { token: "tok-b", source: "body" })).toBe("mismatch");
    expect(checkInterviewCredential(interview, { token: "tok-a", source: "body" }, new Date("2100-01-01T00:00:00Z"))).toBe("expired");
    expect(checkInterviewCredential({ accessToken: null, accessTokenExpiresAt: null }, { token: "x", source: "query" })).toBe("mismatch");

    const missing = assertInterviewCredential(interview, null)!;
    expect(missing.status).toBe(401);
    expect(await missing.json()).toEqual({ error: "Access token required", reason: "missing" });
    const expired = assertInterviewCredential(interview, { token: "tok-a", source: "query" }, new Date("2100-01-01T00:00:00Z"))!;
    expect(expired.status).toBe(401);
    expect(await expired.json()).toMatchObject({ reason: "expired" });
  });

  it("does not leak length information through early mismatch", () => {
    expect(checkInterviewCredential(interview, { token: "tok-", source: "body" })).toBe("mismatch");
    expect(checkInterviewCredential(interview, { token: "tok-aa", source: "body" })).toBe("mismatch");
  });
});
