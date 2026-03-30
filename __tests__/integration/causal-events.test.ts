import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Causal Event Chain Tests
 *
 * Verifies that timeline events include causalEventId linking to
 * prior events for replay-grade audit trail.
 */

// Mock Prisma — single unified mock for both create and createMany
const mockCreate = vi.fn().mockResolvedValue({ id: "evt-1" });
const mockCreateMany = vi.fn().mockResolvedValue({ count: 2 });

vi.mock("@/lib/prisma", () => ({
  prisma: {
    interviewEvent: {
      create: (...args: unknown[]) => mockCreate(...args),
      createMany: (...args: unknown[]) => mockCreateMany(...args),
    },
  },
}));

import { recordEvent, recordEvents } from "@/lib/interview-timeline";

describe("Causal Event Chains", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("recordEvent — single events", () => {
    it("stores causalEventId when provided", async () => {
      await recordEvent("interview-1", "checkpoint", {
        ledgerVersion: 10,
      }, 10, "checkpoint-9");

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          interviewId: "interview-1",
          eventType: "checkpoint",
          turnIndex: 10,
          causalEventId: "checkpoint-9",
        }),
      });
    });

    it("stores null causalEventId when not provided", async () => {
      await recordEvent("interview-1", "connect", { candidateId: "c-1" });

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          interviewId: "interview-1",
          eventType: "connect",
          causalEventId: null,
        }),
      });
    });

    it("stores turnIndex when provided", async () => {
      await recordEvent("interview-1", "disconnect", {
        reason: "normal_end",
      }, 25, "checkpoint-24");

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          turnIndex: 25,
          causalEventId: "checkpoint-24",
        }),
      });
    });

    it("stores null turnIndex when not provided", async () => {
      await recordEvent("interview-1", "reconnect", {
        reconnectCount: 1,
      });

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          turnIndex: null,
        }),
      });
    });
  });

  describe("recordEvents — batch events", () => {
    it("propagates causalEventId in batch events", async () => {
      await recordEvents("interview-1", [
        {
          eventType: "checkpoint",
          payload: { ledgerVersion: 5 },
          turnIndex: 5,
          causalEventId: "checkpoint-4",
        },
        {
          eventType: "state_transition",
          payload: { currentStep: "questioning" },
          turnIndex: 5,
          causalEventId: "checkpoint-4",
        },
      ]);

      expect(mockCreateMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            eventType: "checkpoint",
            causalEventId: "checkpoint-4",
          }),
          expect.objectContaining({
            eventType: "state_transition",
            causalEventId: "checkpoint-4",
          }),
        ]),
      });
    });

    it("defaults causalEventId to null in batch when not provided", async () => {
      await recordEvents("interview-1", [
        {
          eventType: "error",
          payload: { message: "test" },
        },
      ]);

      expect(mockCreateMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            causalEventId: null,
          }),
        ],
      });
    });
  });
});
