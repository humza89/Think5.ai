import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma before importing the module
vi.mock("@/lib/prisma", () => ({
  prisma: {
    interviewEvent: {
      create: vi.fn().mockResolvedValue({ id: "evt-1" }),
      createMany: vi.fn().mockResolvedValue({ count: 2 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

import { recordEvent, recordEvents, getTimeline, generateReplayReport } from "@/lib/interview-timeline";
import { prisma } from "@/lib/prisma";

describe("Interview Timeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("recordEvent", () => {
    it("creates a single event", async () => {
      await recordEvent("int-1", "connect", { clientId: "abc" });
      expect(prisma.interviewEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          interviewId: "int-1",
          eventType: "connect",
          payload: { clientId: "abc" },
          turnIndex: null,
        }),
      });
    });

    it("includes turnIndex when provided", async () => {
      await recordEvent("int-1", "checkpoint", { version: 5 }, 5);
      expect(prisma.interviewEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          turnIndex: 5,
        }),
      });
    });

    it("does not throw on error", async () => {
      vi.mocked(prisma.interviewEvent.create).mockRejectedValueOnce(new Error("DB error"));
      await expect(recordEvent("int-1", "error")).resolves.toBeUndefined();
    });
  });

  describe("recordEvents", () => {
    it("creates batch of events", async () => {
      await recordEvents("int-1", [
        { eventType: "connect" },
        { eventType: "checkpoint", payload: { v: 1 }, turnIndex: 0 },
      ]);
      expect(prisma.interviewEvent.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ eventType: "connect" }),
          expect.objectContaining({ eventType: "checkpoint", turnIndex: 0 }),
        ]),
      });
    });

    it("caps batch at 10 events", async () => {
      const events = Array.from({ length: 15 }, (_, i) => ({
        eventType: "checkpoint" as const,
        turnIndex: i,
      }));
      await recordEvents("int-1", events);
      const callData = vi.mocked(prisma.interviewEvent.createMany).mock.calls[0][0].data;
      expect(callData).toHaveLength(10);
    });

    it("skips empty batch", async () => {
      await recordEvents("int-1", []);
      expect(prisma.interviewEvent.createMany).not.toHaveBeenCalled();
    });
  });

  describe("getTimeline", () => {
    it("queries with interviewId", async () => {
      await getTimeline("int-1");
      expect(prisma.interviewEvent.findMany).toHaveBeenCalledWith({
        where: { interviewId: "int-1" },
        orderBy: { timestamp: "asc" },
      });
    });

    it("applies eventType filter", async () => {
      await getTimeline("int-1", { eventType: "reconnect" });
      expect(prisma.interviewEvent.findMany).toHaveBeenCalledWith({
        where: { interviewId: "int-1", eventType: "reconnect" },
        orderBy: { timestamp: "asc" },
      });
    });

    it("applies timestamp range filter", async () => {
      const from = new Date("2026-01-01");
      const to = new Date("2026-12-31");
      await getTimeline("int-1", { fromTimestamp: from, toTimestamp: to });
      expect(prisma.interviewEvent.findMany).toHaveBeenCalledWith({
        where: {
          interviewId: "int-1",
          timestamp: { gte: from, lte: to },
        },
        orderBy: { timestamp: "asc" },
      });
    });
  });

  describe("generateReplayReport", () => {
    it("returns structured report with anomaly detection", async () => {
      const now = new Date();
      const later = new Date(now.getTime() + 60000);
      vi.mocked(prisma.interviewEvent.findMany).mockResolvedValueOnce([
        { id: "1", interviewId: "int-1", eventType: "connect", payload: null, turnIndex: null, timestamp: now },
        { id: "2", interviewId: "int-1", eventType: "grounding_failure", payload: { score: 0.3 }, turnIndex: 5, timestamp: later },
        { id: "3", interviewId: "int-1", eventType: "reconnect", payload: null, turnIndex: null, timestamp: later },
      ]);

      const report = await generateReplayReport("int-1");
      expect(report.totalEvents).toBe(3);
      expect(report.reconnectCount).toBe(1);
      expect(report.anomalies).toHaveLength(1);
      expect(report.anomalies[0].eventType).toBe("grounding_failure");
      expect(report.duration.durationMs).toBeGreaterThan(0);
    });

    it("handles empty timeline", async () => {
      vi.mocked(prisma.interviewEvent.findMany).mockResolvedValueOnce([]);
      const report = await generateReplayReport("int-1");
      expect(report.totalEvents).toBe(0);
      expect(report.duration.start).toBeNull();
      expect(report.anomalies).toHaveLength(0);
    });
  });
});
