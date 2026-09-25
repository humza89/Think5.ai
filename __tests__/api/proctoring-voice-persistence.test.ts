import { beforeEach, describe, expect, it, vi } from "vitest";

const findManyEvents = vi.fn();
const createManyEvents = vi.fn();
const findUniqueInterview = vi.fn();
const updateInterview = vi.fn();
const createEvent = vi.fn();

const tx = {
  proctoringEvent: { createMany: (...a: unknown[]) => createManyEvents(...a) },
  interview: { findUnique: (...a: unknown[]) => findUniqueInterview(...a), update: (...a: unknown[]) => updateInterview(...a) },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    proctoringEvent: {
      findMany: (...a: unknown[]) => findManyEvents(...a),
      create: (...a: unknown[]) => createEvent(...a),
      createMany: (...a: unknown[]) => createManyEvents(...a),
    },
    interview: {
      findUnique: (...a: unknown[]) => findUniqueInterview(...a),
      update: (...a: unknown[]) => updateInterview(...a),
    },
    $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  },
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true })) }));

import { persistIntegrityBatch, persistProctoringEvents, generateIntegrityConformanceReport, integrityEventKey } from "@/lib/proctoring-normalizer";
import { POST } from "@/app/api/interviews/[id]/proctoring/route";

const T1 = "2026-09-25T10:00:00.000Z";
const T2 = "2026-09-25T10:00:05.000Z";

describe("persistIntegrityBatch", () => {
  beforeEach(() => {
    findManyEvents.mockReset();
    createManyEvents.mockReset();
    findUniqueInterview.mockReset();
    updateInterview.mockReset();
  });

  it("writes fresh rows once, appends them to Interview.integrityEvents, and dedupes within the batch", async () => {
    findManyEvents.mockResolvedValue([]);
    findUniqueInterview.mockResolvedValue({ integrityEvents: [{ type: "focus_lost", timestamp: "2026-09-25T09:59:00.000Z" }] });
    const result = await persistIntegrityBatch("int-1", [
      { type: "tab_switch", description: "switched", timestamp: T1 },
      { type: "tab_switch", description: "switched again (duplicate)", timestamp: T1 },
      { type: "paste_detected", timestamp: T2 },
    ]);
    expect(result).toEqual({ persisted: 2, deduplicated: 1 });
    const rows = createManyEvents.mock.calls[0][0].data;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ interviewId: "int-1", eventType: "tab_switch", severity: "MEDIUM", details: { description: "switched", idempotencyKey: integrityEventKey("int-1", "tab_switch", T1) } });
    expect(rows[1]).toMatchObject({ eventType: "paste_detected", severity: "HIGH" });
    const appended = updateInterview.mock.calls[0][0].data.integrityEvents;
    expect(appended).toHaveLength(3);
    expect(appended[1]).toEqual({ type: "tab_switch", description: "switched", timestamp: T1 });
  });

  it("dedupes against rows already stored for the interview", async () => {
    findManyEvents.mockResolvedValue([{ eventType: "tab_switch", timestamp: new Date(T1) }]);
    const result = await persistIntegrityBatch("int-1", [{ type: "tab_switch", timestamp: T1 }]);
    expect(result).toEqual({ persisted: 0, deduplicated: 1 });
    expect(createManyEvents).not.toHaveBeenCalled();
    expect(updateInterview).not.toHaveBeenCalled();
  });

  it("persistProctoringEvents (end of interview) is idempotent and does not re-append the JSON column", async () => {
    findManyEvents.mockResolvedValue([]);
    const first = await persistProctoringEvents("int-1", [{ type: "tab_switch", timestamp: T1 }]);
    expect(first.persisted).toBe(1);
    expect(updateInterview).not.toHaveBeenCalled();
    findManyEvents.mockResolvedValue([{ eventType: "tab_switch", timestamp: new Date(T1) }]);
    const second = await persistProctoringEvents("int-1", [{ type: "tab_switch", timestamp: T1 }]);
    expect(second.persisted).toBe(0);
  });

  it("a tab_switch row lowers the integrity score below 100", async () => {
    findManyEvents.mockResolvedValue([{ eventType: "tab_switch", severity: "MEDIUM", timestamp: new Date(T1), details: null }]);
    const report = await generateIntegrityConformanceReport("int-1");
    expect(report.eventsDetected).toBe(1);
    expect(report.integrityScore).toBeLessThan(100);
  });
});

describe("POST /api/interviews/[id]/proctoring batches", () => {
  beforeEach(() => {
    findManyEvents.mockReset().mockResolvedValue([]);
    createManyEvents.mockReset();
    findUniqueInterview.mockReset();
    updateInterview.mockReset();
    createEvent.mockReset();
  });

  function post(body: unknown, cookie = "interview-session=int-1:tok-a") {
    return POST(
      new Request("http://localhost/api/interviews/int-1/proctoring", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify(body),
      }) as never,
      { params: Promise.resolve({ id: "int-1" }) },
    );
  }

  it("persists a batch with the cookie credential and reports counts", async () => {
    findUniqueInterview
      .mockResolvedValueOnce({ id: "int-1", accessToken: "tok-a", accessTokenExpiresAt: null }) // credential lookup
      .mockResolvedValueOnce({ integrityEvents: [] }); // JSON column read inside the transaction
    const response = await post({ events: [{ type: "tab_switch", timestamp: T1 }, { type: "tab_switch", timestamp: T1 }] });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, persisted: 1, deduplicated: 1 });
    expect(createManyEvents).toHaveBeenCalledTimes(1);
  });

  it("rejects a batch without a valid credential", async () => {
    findUniqueInterview.mockResolvedValueOnce({ id: "int-1", accessToken: "tok-a", accessTokenExpiresAt: null });
    const response = await post({ events: [{ type: "tab_switch", timestamp: T1 }] }, "interview-session=int-1:wrong");
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ reason: "mismatch" });
  });

  it("rejects an oversized or malformed batch", async () => {
    const response = await post({ events: [{ type: "tab_switch", timestamp: "not-a-date" }] });
    expect(response.status).toBe(400);
  });

  it("still accepts the legacy single-event shape", async () => {
    findUniqueInterview.mockResolvedValueOnce({ id: "int-1", accessToken: "tok-a", accessTokenExpiresAt: null });
    createEvent.mockResolvedValue({});
    const response = await post({ eventType: "TAB_SWITCHED", severity: "MEDIUM" });
    expect(response.status).toBe(200);
    expect(createEvent).toHaveBeenCalledTimes(1);
  });
});
