import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "crypto";

// Mock Prisma
const mockFindMany = vi.fn();
const mockUpdateMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    interviewTranscript: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
    },
  },
}));

import { verifyContentIntegrity, finalizeLedger } from "@/lib/conversation-ledger";

describe("Conversation Ledger — Content Integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("verifyContentIntegrity", () => {
    it("returns empty array when all checksums match", async () => {
      const content = "Hello, how are you?";
      const role = "candidate";
      const checksum = createHash("sha256")
        .update(`${role}:${content}`)
        .digest("hex")
        .slice(0, 16);

      mockFindMany.mockResolvedValue([
        { turnIndex: 0, turnId: "turn-0", role, content, contentChecksum: checksum },
      ]);

      const result = await verifyContentIntegrity("interview-1");
      expect(result).toHaveLength(0);
    });

    it("detects tampered content (checksum mismatch)", async () => {
      const originalContent = "I worked at Google for 5 years";
      const role = "candidate";
      const originalChecksum = createHash("sha256")
        .update(`${role}:${originalContent}`)
        .digest("hex")
        .slice(0, 16);

      // Return row where content has been tampered but checksum is from original
      mockFindMany.mockResolvedValue([
        {
          turnIndex: 0,
          turnId: "turn-0",
          role,
          content: "I worked at Google for 10 years", // tampered
          contentChecksum: originalChecksum,
        },
      ]);

      const result = await verifyContentIntegrity("interview-1");
      expect(result).toHaveLength(1);
      expect(result[0].turnIndex).toBe(0);
      expect(result[0].turnId).toBe("turn-0");
      expect(result[0].expected).toBe(originalChecksum);
      expect(result[0].actual).not.toBe(originalChecksum);
    });

    it("skips rows without checksum", async () => {
      mockFindMany.mockResolvedValue([
        { turnIndex: 0, turnId: "turn-0", role: "user", content: "hi", contentChecksum: null },
      ]);

      const result = await verifyContentIntegrity("interview-1");
      expect(result).toHaveLength(0);
    });

    it("handles multiple turns with mixed integrity", async () => {
      const goodContent = "Good content";
      const goodChecksum = createHash("sha256")
        .update(`candidate:${goodContent}`)
        .digest("hex")
        .slice(0, 16);

      const badChecksum = createHash("sha256")
        .update("assistant:original content")
        .digest("hex")
        .slice(0, 16);

      mockFindMany.mockResolvedValue([
        { turnIndex: 0, turnId: "t-0", role: "candidate", content: goodContent, contentChecksum: goodChecksum },
        { turnIndex: 1, turnId: "t-1", role: "assistant", content: "tampered content", contentChecksum: badChecksum },
        { turnIndex: 2, turnId: "t-2", role: "candidate", content: "no checksum", contentChecksum: null },
      ]);

      const result = await verifyContentIntegrity("interview-1");
      expect(result).toHaveLength(1);
      expect(result[0].turnIndex).toBe(1);
    });
  });

  describe("finalizeLedger", () => {
    it("marks all unfinalized turns as finalized", async () => {
      mockUpdateMany.mockResolvedValue({ count: 15 });

      const count = await finalizeLedger("interview-1");
      expect(count).toBe(15);
      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: { interviewId: "interview-1", finalized: false },
        data: { finalized: true },
      });
    });

    it("returns 0 when all turns already finalized", async () => {
      mockUpdateMany.mockResolvedValue({ count: 0 });

      const count = await finalizeLedger("interview-1");
      expect(count).toBe(0);
    });
  });
});
