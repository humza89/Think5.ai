import { afterEach, describe, expect, it, vi } from "vitest";
import { csrfHeaders, getCsrfToken, CSRF_HEADER_NAME } from "@/lib/csrf-client";

function stubCookie(cookie: string) {
  vi.stubGlobal("document", { cookie });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("csrf-client", () => {
  it("returns null outside the browser", () => {
    vi.stubGlobal("document", undefined);
    expect(getCsrfToken()).toBeNull();
    expect(csrfHeaders()).toEqual({});
  });

  it("reads the readable mirror cookie among other cookies", () => {
    stubCookie("sb-auth=abc; csrf-token-client=tok%3D123; theme=dark");
    expect(getCsrfToken()).toBe("tok=123");
    expect(csrfHeaders()).toEqual({ [CSRF_HEADER_NAME]: "tok=123" });
  });

  it("does not confuse the HttpOnly cookie name prefix with the mirror", () => {
    // The HttpOnly `csrf-token` is never visible to document.cookie, but a
    // cookie whose name merely starts with the prefix must not match either.
    stubCookie("csrf-token-clientx=wrong");
    expect(getCsrfToken()).toBeNull();
  });

  it("returns no header when the mirror is empty", () => {
    stubCookie("csrf-token-client=");
    expect(csrfHeaders()).toEqual({});
  });
});
