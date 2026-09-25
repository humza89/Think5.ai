import { afterEach, describe, expect, it, vi } from "vitest";
import { requireCronSecret } from "@/lib/cron-auth";

const req = (authorization?: string) => ({ headers: { get: (n: string) => (n.toLowerCase() === "authorization" ? (authorization ?? null) : null) } });

describe("requireCronSecret", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("rejects when the secret is not configured, even with a matching-looking header", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const denied = requireCronSecret(req("Bearer undefined"))!;
    expect(denied.status).toBe(401);
    expect(await denied.json()).toEqual({ error: "Cron secret is not configured" });
  });

  it("rejects a missing or wrong bearer", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect(requireCronSecret(req())!.status).toBe(401);
    expect(requireCronSecret(req("Bearer nope"))!.status).toBe(401);
    expect(requireCronSecret(req("s3cret"))!.status).toBe(401);
  });

  it("accepts the configured bearer", () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect(requireCronSecret(req("Bearer s3cret"))).toBeNull();
  });
});
