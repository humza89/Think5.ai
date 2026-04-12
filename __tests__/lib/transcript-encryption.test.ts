/**
 * Track 5 Task 22 tests for lib/transcript-encryption.ts.
 *
 * Invariants under test:
 *   1. Feature flag off → encryptTranscript is a no-op.
 *   2. Feature flag on → encryptTranscript produces a PII-encrypted
 *      string that is NOT legible plaintext.
 *   3. decryptTranscript round-trips to the original JSON shape.
 *   4. Null / empty / already-encrypted inputs are passed through.
 *   5. decryptInterviewRowOrList works on single rows and arrays.
 *   6. Decryption is a no-op on non-encrypted legacy rows (migration safe).
 */

import { beforeEach, afterEach, describe, expect, it } from "vitest";
import {
  encryptTranscript,
  decryptTranscript,
  decryptInterviewRowOrList,
} from "@/lib/transcript-encryption";
import { isPIIEncrypted } from "@/lib/pii-encryption";

const ORIGINAL_FLAG = process.env.TRANSCRIPT_ENCRYPTION_ENABLED;
const ORIGINAL_KEY = process.env.PII_ENCRYPTION_KEY;

beforeEach(() => {
  // 64 hex chars = 32 bytes — required shape for PII_ENCRYPTION_KEY
  process.env.PII_ENCRYPTION_KEY = "a".repeat(64);
});

afterEach(() => {
  if (ORIGINAL_FLAG === undefined) {
    delete process.env.TRANSCRIPT_ENCRYPTION_ENABLED;
  } else {
    process.env.TRANSCRIPT_ENCRYPTION_ENABLED = ORIGINAL_FLAG;
  }
  if (ORIGINAL_KEY === undefined) {
    delete process.env.PII_ENCRYPTION_KEY;
  } else {
    process.env.PII_ENCRYPTION_KEY = ORIGINAL_KEY;
  }
});

const SAMPLE_TRANSCRIPT = [
  { role: "interviewer", content: "Tell me about yourself.", timestamp: "2026-04-11T12:00:00Z" },
  { role: "candidate", content: "I have 8 years of experience in...", timestamp: "2026-04-11T12:00:05Z" },
];

// ── Flag gating ──────────────────────────────────────────────────────

describe("encryptTranscript — feature flag gating", () => {
  it("passes through unchanged when the flag is OFF", () => {
    delete process.env.TRANSCRIPT_ENCRYPTION_ENABLED;
    const result = encryptTranscript(SAMPLE_TRANSCRIPT);
    expect(result).toBe(SAMPLE_TRANSCRIPT);
  });

  it("encrypts when the flag is ON", () => {
    process.env.TRANSCRIPT_ENCRYPTION_ENABLED = "true";
    const result = encryptTranscript(SAMPLE_TRANSCRIPT);
    expect(typeof result).toBe("string");
    expect(isPIIEncrypted(result as string)).toBe(true);
    // Verify the plaintext DOES NOT appear in the encrypted blob
    expect(result).not.toContain("Tell me about yourself");
  });
});

// ── Pass-through semantics ──────────────────────────────────────────

describe("encryptTranscript — pass-through cases", () => {
  beforeEach(() => {
    process.env.TRANSCRIPT_ENCRYPTION_ENABLED = "true";
  });

  it("passes through null", () => {
    expect(encryptTranscript(null)).toBeNull();
  });

  it("passes through undefined", () => {
    expect(encryptTranscript(undefined)).toBeUndefined();
  });

  it("passes through an empty array", () => {
    const empty: unknown[] = [];
    expect(encryptTranscript(empty)).toBe(empty);
  });

  it("passes through an empty string", () => {
    expect(encryptTranscript("")).toBe("");
  });

  it("does not double-encrypt an already-encrypted blob", () => {
    const first = encryptTranscript(SAMPLE_TRANSCRIPT) as string;
    const second = encryptTranscript(first);
    expect(second).toBe(first);
  });
});

// ── Round-trip ──────────────────────────────────────────────────────

describe("encryptTranscript → decryptTranscript round-trip", () => {
  beforeEach(() => {
    process.env.TRANSCRIPT_ENCRYPTION_ENABLED = "true";
  });

  it("recovers the original transcript shape", () => {
    const encrypted = encryptTranscript(SAMPLE_TRANSCRIPT);
    const decrypted = decryptTranscript(encrypted);
    expect(decrypted).toEqual(SAMPLE_TRANSCRIPT);
  });

  it("preserves nested objects inside turns", () => {
    const complex = [
      {
        role: "candidate",
        content: "answer",
        metadata: { language: "en", confidence: 0.92, flags: ["one", "two"] },
      },
    ];
    const encrypted = encryptTranscript(complex);
    const decrypted = decryptTranscript(encrypted);
    expect(decrypted).toEqual(complex);
  });

  it("handles Unicode content (emoji, non-ASCII)", () => {
    const unicode = [
      { role: "candidate", content: "Hola 😀 — ¿cómo estás? 日本語" },
    ];
    const encrypted = encryptTranscript(unicode);
    const decrypted = decryptTranscript(encrypted);
    expect(decrypted).toEqual(unicode);
  });
});

// ── Backward compatibility on read ──────────────────────────────────

describe("decryptTranscript — legacy plaintext pass-through", () => {
  it("returns the original JSON array for unencrypted legacy rows", () => {
    // Legacy path: no flag ever enabled, transcript stored as raw array
    const result = decryptTranscript(SAMPLE_TRANSCRIPT);
    expect(result).toEqual(SAMPLE_TRANSCRIPT);
  });

  it("passes through null and undefined unchanged", () => {
    expect(decryptTranscript(null)).toBeNull();
    expect(decryptTranscript(undefined)).toBeUndefined();
  });

  it("parses a JSON string as a fallback", () => {
    const asString = JSON.stringify(SAMPLE_TRANSCRIPT);
    const result = decryptTranscript(asString);
    expect(result).toEqual(SAMPLE_TRANSCRIPT);
  });

  it("returns the raw string when it's neither JSON nor encrypted", () => {
    expect(decryptTranscript("raw-text-not-json")).toBe("raw-text-not-json");
  });
});

// ── Row-shape helper ────────────────────────────────────────────────

describe("decryptInterviewRowOrList", () => {
  beforeEach(() => {
    process.env.TRANSCRIPT_ENCRYPTION_ENABLED = "true";
  });

  it("decrypts transcript on a single row", () => {
    const encrypted = encryptTranscript(SAMPLE_TRANSCRIPT);
    const row = { id: "iv1", transcript: encrypted, status: "COMPLETED" };
    decryptInterviewRowOrList(row);
    expect(row.transcript).toEqual(SAMPLE_TRANSCRIPT);
  });

  it("decrypts transcript on every row in an array result", () => {
    const encrypted = encryptTranscript(SAMPLE_TRANSCRIPT);
    const rows = [
      { id: "iv1", transcript: encrypted },
      { id: "iv2", transcript: encrypted },
      { id: "iv3", transcript: null },
    ];
    decryptInterviewRowOrList(rows);
    expect(rows[0]!.transcript).toEqual(SAMPLE_TRANSCRIPT);
    expect(rows[1]!.transcript).toEqual(SAMPLE_TRANSCRIPT);
    expect(rows[2]!.transcript).toBeNull();
  });

  it("is a no-op when the row has no transcript field (partial select)", () => {
    const row: { id: string } = { id: "iv1" };
    const result = decryptInterviewRowOrList(row);
    expect(result).toBe(row);
    expect(row).toEqual({ id: "iv1" });
  });

  it("passes through null / undefined results", () => {
    expect(decryptInterviewRowOrList(null)).toBeNull();
    expect(decryptInterviewRowOrList(undefined)).toBeUndefined();
  });
});
