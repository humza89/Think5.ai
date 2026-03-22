import { describe, it, expect, beforeEach } from "vitest";

// Mock Redis to not be available — force in-memory mode
vi.mock("@upstash/redis", () => {
  throw new Error("Redis not available in test");
});

// Import after mocking
const { checkRateLimit } = await import("@/lib/rate-limit");

describe("checkRateLimit (in-memory)", () => {
  beforeEach(() => {
    // Each test gets a unique key to avoid interference
  });

  it("allows requests within the limit", async () => {
    const key = `test-allow-${Date.now()}`;
    const config = { maxRequests: 3, windowMs: 60000 };

    const r1 = await checkRateLimit(key, config);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = await checkRateLimit(key, config);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = await checkRateLimit(key, config);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it("blocks requests over the limit", async () => {
    const key = `test-block-${Date.now()}`;
    const config = { maxRequests: 2, windowMs: 60000 };

    await checkRateLimit(key, config);
    await checkRateLimit(key, config);

    const r3 = await checkRateLimit(key, config);
    expect(r3.allowed).toBe(false);
    expect(r3.remaining).toBe(0);
  });

  it("resets after window expires", async () => {
    const key = `test-reset-${Date.now()}`;
    const config = { maxRequests: 1, windowMs: 50 }; // 50ms window

    const r1 = await checkRateLimit(key, config);
    expect(r1.allowed).toBe(true);

    const r2 = await checkRateLimit(key, config);
    expect(r2.allowed).toBe(false);

    // Wait for window to expire
    await new Promise((resolve) => setTimeout(resolve, 60));

    const r3 = await checkRateLimit(key, config);
    expect(r3.allowed).toBe(true);
  });

  it("uses default config when none provided", async () => {
    const key = `test-default-${Date.now()}`;
    const result = await checkRateLimit(key);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(99); // default maxRequests is 100
  });

  it("returns resetAt in the future", async () => {
    const key = `test-resetat-${Date.now()}`;
    const result = await checkRateLimit(key, { maxRequests: 10, windowMs: 60000 });
    expect(result.resetAt).toBeGreaterThan(Date.now());
  });
});
