/**
 * Track-1 correctness tests for lib/media-storage.ts.
 *
 * These tests lock in the fix that removes the silent "first chunk"
 * playback fallback — the single worst correctness bug in the recruiter
 * playback pipeline. See docs/audit Track 1, Task 2.
 *
 * The module depends on the AWS S3 client and R2 credentials which we
 * don't have in unit tests. Instead of mounting the full client, we
 * mock `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` so the
 * tests exercise the branching logic (merge retry, fallback kill-switch,
 * RecordingMergeFailedError throwing) without making any network calls.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Capture whatever the caller last instantiated so tests can introspect
// what commands were sent to the fake S3 client.
const sentCommands: Array<{ kind: string; input: unknown }> = [];

// A minimal fake S3 client whose behavior we reconfigure per-test. The
// default is "everything exists and succeeds" — tests override specific
// command handlers to simulate failure modes.
type CommandHandler = (input: unknown) => Promise<unknown>;
const commandHandlers: Record<string, CommandHandler> = {
  HeadObjectCommand: async () => ({ ContentLength: 1024 }),
  GetObjectCommand: async () => ({
    Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
  }),
  PutObjectCommand: async () => ({}),
  DeleteObjectCommand: async () => ({}),
  ListObjectsV2Command: async () => ({ Contents: [] }),
};

vi.mock("@aws-sdk/client-s3", () => {
  class FakeCommand {
    constructor(public readonly input: unknown) {}
  }
  const wrap = (kind: string) =>
    class extends FakeCommand {
      readonly __kind = kind;
    };

  return {
    S3Client: class {
      async send(cmd: { __kind: string; input: unknown }) {
        sentCommands.push({ kind: cmd.__kind, input: cmd.input });
        const handler = commandHandlers[cmd.__kind];
        if (!handler) throw new Error(`no handler for ${cmd.__kind}`);
        return handler(cmd.input);
      }
    },
    HeadObjectCommand: wrap("HeadObjectCommand"),
    GetObjectCommand: wrap("GetObjectCommand"),
    PutObjectCommand: wrap("PutObjectCommand"),
    DeleteObjectCommand: wrap("DeleteObjectCommand"),
    ListObjectsV2Command: wrap("ListObjectsV2Command"),
  };
});

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(async () => "https://r2.example/signed-url"),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

beforeEach(() => {
  sentCommands.length = 0;
  // Reset to the default "everything works" behavior before each test.
  commandHandlers.HeadObjectCommand = async () => ({ ContentLength: 1024 });
  commandHandlers.GetObjectCommand = async () => ({
    Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
  });
  commandHandlers.PutObjectCommand = async () => ({});

  // R2 credentials must be set so getR2Client() doesn't throw. Values are
  // meaningless because the client is mocked above.
  process.env.R2_ACCOUNT_ID = "test-account";
  process.env.R2_ACCESS_KEY_ID = "test-key";
  process.env.R2_SECRET_ACCESS_KEY = "test-secret";
  process.env.R2_BUCKET_NAME = "test-bucket";
  // Default: kill-switch OFF (safe behavior).
  delete process.env.PLAYBACK_ALLOW_FIRST_CHUNK_FALLBACK;
});

afterEach(() => {
  vi.resetModules();
});

// ── finalizeRecording ─────────────────────────────────────────────────

describe("finalizeRecording — Track 1 correctness contract", () => {
  it("returns mergeSucceeded=true on the happy path and writes the merged file", async () => {
    const { finalizeRecording } = await import("@/lib/media-storage");
    const metadata = await finalizeRecording("iv1", 3, "webm", 120);

    expect(metadata.mergeSucceeded).toBe(true);
    expect(metadata.interviewId).toBe("iv1");
    expect(metadata.chunkCount).toBe(3);

    // Should have written both the manifest AND the merged file.
    const puts = sentCommands.filter((c) => c.kind === "PutObjectCommand");
    const keys = puts.map((p) => (p.input as { Key: string }).Key);
    expect(keys).toContain("recordings/iv1/manifest.json");
    expect(keys).toContain("recordings/iv1/recording.webm");
  });

  it("throws RecordingMergeFailedError when all merge retries fail", async () => {
    // Inject a GetObjectCommand failure so the internal mergeRecordingChunks
    // call cannot read chunks from R2 — which by itself would result in an
    // empty merged file rather than a throw. To force the retry/throw path
    // we fail the PutObjectCommand for the merged recording key specifically
    // (the manifest put is also a PutObjectCommand but happens AFTER merge).
    commandHandlers.PutObjectCommand = async (input: unknown) => {
      const key = (input as { Key: string }).Key;
      if (key.endsWith("/recording.webm")) {
        throw new Error("simulated R2 throttle");
      }
      return {};
    };

    const { finalizeRecording, RecordingMergeFailedError } = await import(
      "@/lib/media-storage"
    );

    await expect(finalizeRecording("iv-fail", 2, "webm")).rejects.toBeInstanceOf(
      RecordingMergeFailedError,
    );
  });

  it("writes manifest with mergeSucceeded=false BEFORE throwing so the record is durable", async () => {
    commandHandlers.PutObjectCommand = async (input: unknown) => {
      const key = (input as { Key: string }).Key;
      if (key.endsWith("/recording.webm")) {
        throw new Error("simulated R2 throttle");
      }
      return {};
    };

    const { finalizeRecording, RecordingMergeFailedError } = await import(
      "@/lib/media-storage"
    );

    await expect(finalizeRecording("iv-audit", 2, "webm")).rejects.toBeInstanceOf(
      RecordingMergeFailedError,
    );

    // The manifest must be persisted even when merge fails, so the
    // reconciliation cron and admin dashboards can see the truth.
    const manifestPuts = sentCommands.filter(
      (c) =>
        c.kind === "PutObjectCommand" &&
        (c.input as { Key: string }).Key.endsWith("/manifest.json"),
    );
    expect(manifestPuts).toHaveLength(1);
    const body = JSON.parse((manifestPuts[0]!.input as { Body: string }).Body);
    expect(body.mergeSucceeded).toBe(false);
  });
});

// ── getSignedPlaybackUrl ──────────────────────────────────────────────

describe("getSignedPlaybackUrl — Track 1 correctness contract", () => {
  it("returns a signed URL when the merged recording exists", async () => {
    const { getSignedPlaybackUrl } = await import("@/lib/media-storage");
    const url = await getSignedPlaybackUrl("iv-ok");
    expect(url).toBe("https://r2.example/signed-url");
  });

  it("returns null (not a fallback URL) when the merged recording is missing and kill-switch is off", async () => {
    // Make every HeadObjectCommand fail so the merged file lookup fails AND
    // the first-chunk lookup would also fail. If the new code incorrectly
    // still falls back to the first chunk we'd see a signed URL here.
    commandHandlers.HeadObjectCommand = async () => {
      throw new Error("NotFound");
    };

    const { getSignedPlaybackUrl } = await import("@/lib/media-storage");
    const url = await getSignedPlaybackUrl("iv-missing");
    expect(url).toBeNull();
  });

  it("does NOT silently serve the first chunk when merged is missing but first chunk exists", async () => {
    // Simulate the exact historical bug: merged file missing but chunks
    // still exist in R2. The fix must refuse to serve them by default.
    commandHandlers.HeadObjectCommand = async (input: unknown) => {
      const key = (input as { Key: string }).Key;
      if (key.endsWith("/recording.webm")) {
        throw new Error("NotFound");
      }
      // First chunk exists
      return { ContentLength: 1024 };
    };

    const { getSignedPlaybackUrl } = await import("@/lib/media-storage");
    const url = await getSignedPlaybackUrl("iv-degraded");
    expect(url).toBeNull();
  });

  it("serves the first chunk ONLY when PLAYBACK_ALLOW_FIRST_CHUNK_FALLBACK=true (emergency rollback)", async () => {
    process.env.PLAYBACK_ALLOW_FIRST_CHUNK_FALLBACK = "true";
    commandHandlers.HeadObjectCommand = async (input: unknown) => {
      const key = (input as { Key: string }).Key;
      if (key.endsWith("/recording.webm")) {
        throw new Error("NotFound");
      }
      return { ContentLength: 1024 };
    };

    // Re-import so the module picks up the env flag at load time.
    vi.resetModules();
    const { getSignedPlaybackUrl } = await import("@/lib/media-storage");
    const url = await getSignedPlaybackUrl("iv-emergency-rollback");
    expect(url).toBe("https://r2.example/signed-url");
  });
});
