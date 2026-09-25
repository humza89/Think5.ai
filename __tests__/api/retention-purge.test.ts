import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
const updateMany = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { interview: { findMany: (...a: unknown[]) => findMany(...a) }, candidate: { updateMany: (...a: unknown[]) => updateMany(...a) } } }));

import { GET, runRetentionPurge } from "@/app/api/cron/retention-purge/route";

describe("retention purge", () => {
  beforeEach(() => {
    findMany.mockReset();
    updateMany.mockReset();
    vi.stubEnv("CRON_SECRET", "s3cret");
  });

  it("targets terminal interviews older than 30 days whose candidate is not purged or on legal hold", async () => {
    const now = new Date("2026-09-25T03:30:00.000Z");
    findMany.mockResolvedValue([{ candidateId: "c1" }, { candidateId: "c1" }, { candidateId: "c2" }]);
    updateMany.mockResolvedValue({ count: 2 });
    const result = await runRetentionPurge(now);
    expect(result).toEqual({ purgedCount: 2, candidateIds: ["c1", "c2"] });
    const where = findMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ in: ["COMPLETED", "CANCELLED", "EXPIRED"] });
    expect(where.updatedAt.lt.toISOString()).toBe("2026-08-26T03:30:00.000Z");
    expect(where.candidate).toEqual({ piiPurgedAt: null, legalHold: false });
    const update = updateMany.mock.calls[0][0];
    expect(update.where).toEqual({ id: { in: ["c1", "c2"] }, piiPurgedAt: null, legalHold: false });
    expect(update.data).toMatchObject({ fullName: "Purged Candidate", email: null, resumeUrl: null, piiPurgedAt: now });
  });

  it("is a no-op when nothing qualifies", async () => {
    findMany.mockResolvedValue([]);
    expect(await runRetentionPurge()).toEqual({ purgedCount: 0, candidateIds: [] });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("GET requires the cron secret", async () => {
    const denied = await GET(new Request("http://localhost/api/cron/retention-purge") as never);
    expect(denied.status).toBe(401);
    findMany.mockResolvedValue([]);
    const ok = await GET(new Request("http://localhost/api/cron/retention-purge", { headers: { authorization: "Bearer s3cret" } }) as never);
    expect(ok.status).toBe(200);
  });
});
