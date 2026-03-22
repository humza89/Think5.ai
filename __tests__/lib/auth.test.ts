import { describe, it, expect, vi } from "vitest";

// Mock Sentry to avoid import errors
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

const { AuthError, handleAuthError } = await import("@/lib/auth");

describe("AuthError", () => {
  it("creates error with message and status code", () => {
    const error = new AuthError("Unauthorized", 401);
    expect(error.message).toBe("Unauthorized");
    expect(error.statusCode).toBe(401);
    expect(error.name).toBe("AuthError");
    expect(error).toBeInstanceOf(Error);
  });
});

describe("handleAuthError", () => {
  it("returns AuthError message and status for known auth errors", () => {
    const error = new AuthError("Access denied", 403);
    const result = handleAuthError(error);
    expect(result.error).toBe("Access denied");
    expect(result.status).toBe(403);
  });

  it("returns 401 for unauthorized AuthError", () => {
    const error = new AuthError("Not authenticated", 401);
    const result = handleAuthError(error);
    expect(result.error).toBe("Not authenticated");
    expect(result.status).toBe(401);
  });

  it("returns generic message for unknown errors (no internal leaks)", () => {
    const error = new Error("Database connection failed: postgres://user:pass@host");
    const result = handleAuthError(error);
    expect(result.error).toBe("Internal server error");
    expect(result.status).toBe(500);
    // Must NOT contain the original error message
    expect(result.error).not.toContain("Database");
    expect(result.error).not.toContain("postgres");
  });

  it("returns generic message for string errors", () => {
    const result = handleAuthError("some string error");
    expect(result.error).toBe("Internal server error");
    expect(result.status).toBe(500);
  });

  it("returns generic message for null/undefined errors", () => {
    const result = handleAuthError(null);
    expect(result.error).toBe("Internal server error");
    expect(result.status).toBe(500);
  });
});
