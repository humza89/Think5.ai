/**
 * lib/media-storage — merge failure is a typed error and playback never falls
 * back to the first chunk (salvaged from legacy PR #4).
 *
 * The S3 client is replaced by a fake whose per-command behaviour each test
 * configures; no network calls are made.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sentCommands: Array<{ kind: string; input: Record<string, unknown> }> = [];
type Handler = (input: Record<string, unknown>) => Promise<unknown>;
const handlers: Record<string, Handler> = {};

function resetHandlers() {
  handlers.HeadObjectCommand = async () => ({ ContentLength: 1024 });
  handlers.GetObjectCommand = async () => ({
    Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
  });
  handlers.PutObjectCommand = async () => ({});
  handlers.DeleteObjectCommand = async () => ({});
  handlers.DeleteObjectsCommand = async () => ({});
  handlers.ListObjectsV2Command = async () => ({ Contents: [] });
}

vi.mock("@aws-sdk/client-s3", () => {
  const wrap = (kind: string) =>
    class {
      readonly __kind = kind;
      constructor(public readonly input: Record<string, unknown>) {}
    };
  return {
    S3Client: class {
      async send(cmd: { __kind: string; input: Record<string, unknown> }) {
        sentCommands.push({ kind: cmd.__kind, input: cmd.input });
        const handler = handlers[cmd.__kind];
        if (!handler) throw new Error(`no handler for ${cmd.__kind}`);
        return handler(cmd.input);
      }
    },
    HeadObjectCommand: wrap("HeadObjectCommand"),
    GetObjectCommand: wrap("GetObjectCommand"),
    PutObjectCommand: wrap("PutObjectCommand"),
    DeleteObjectCommand: wrap("DeleteObjectCommand"),
    DeleteObjectsCommand: wrap("DeleteObjectsCommand"),
    ListObjectsV2Command: wrap("ListObjectsV2Command"),
  };
});

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(async (_client: unknown, cmd: { input: { Key: string } }) => `https://r2.example/signed/${cmd.input.Key}`),
}));

const captureException = vi.fn();
vi.mock("@sentry/nextjs", () => ({ captureException: (...args: unknown[]) => captureException(...args) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

beforeEach(() => {
  sentCommands.length = 0;
  captureException.mockClear();
  resetHandlers();
  vi.stubEnv("R2_ACCOUNT_ID", "acct");
  vi.stubEnv("R2_ACCESS_KEY_ID", "key");
  vi.stubEnv("R2_SECRET_ACCESS_KEY", "secret");
  vi.stubEnv("R2_BUCKET_NAME", "test-bucket");
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.resetModules();
});

function failMergedPut() {
  handlers.PutObjectCommand = async (input) => {
    if (String(input.Key).endsWith("/recording.webm")) throw new Error("simulated R2 throttle");
    return {};
  };
}

describe("finalizeRecording", () => {
  it("writes the merged file and a manifest with mergeSucceeded=true", async () => {
    const { finalizeRecording } = await import("@/lib/media-storage");
    const metadata = await finalizeRecording("iv1", 3, "webm", 120);
    expect(metadata).toMatchObject({ interviewId: "iv1", chunkCount: 3, mergeSucceeded: true, durationSeconds: 120 });
    const keys = sentCommands.filter((c) => c.kind === "PutObjectCommand").map((c) => c.input.Key);
    expect(keys).toContain("recordings/iv1/recording.webm");
    expect(keys).toContain("recordings/iv1/manifest.json");
  });

  it("throws RecordingMergeFailedError after all retries fail", async () => {
    failMergedPut();
    const { finalizeRecording, RecordingMergeFailedError } = await import("@/lib/media-storage");
    const pending = finalizeRecording("iv-fail", 2, "webm");
    const assertion = expect(pending).rejects.toBeInstanceOf(RecordingMergeFailedError);
    await vi.advanceTimersByTimeAsync(10_000); // 1s + 2s backoff
    await assertion;
    await expect(pending).rejects.toMatchObject({ interviewId: "iv-fail", attempts: 3 });
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it("persists the manifest with mergeSucceeded=false before throwing", async () => {
    failMergedPut();
    const { finalizeRecording } = await import("@/lib/media-storage");
    const pending = finalizeRecording("iv-audit", 2, "webm").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(10_000);
    await pending;
    const manifests = sentCommands.filter((c) => c.kind === "PutObjectCommand" && String(c.input.Key).endsWith("/manifest.json"));
    expect(manifests).toHaveLength(1);
    expect(JSON.parse(String(manifests[0]!.input.Body)).mergeSucceeded).toBe(false);
  });
});

describe("getSignedPlaybackUrl", () => {
  it("signs the merged recording when it exists", async () => {
    const { getSignedPlaybackUrl } = await import("@/lib/media-storage");
    expect(await getSignedPlaybackUrl("iv-ok")).toBe("https://r2.example/signed/recordings/iv-ok/recording.webm");
  });

  it("returns null when the merged recording is missing", async () => {
    handlers.HeadObjectCommand = async () => {
      throw new Error("NotFound");
    };
    const { getSignedPlaybackUrl } = await import("@/lib/media-storage");
    expect(await getSignedPlaybackUrl("iv-missing")).toBeNull();
  });

  it("does NOT serve the first chunk when the merged file is missing but chunks exist", async () => {
    handlers.HeadObjectCommand = async (input) => {
      if (String(input.Key).endsWith("/recording.webm")) throw new Error("NotFound");
      return { ContentLength: 1024 }; // chunk 000000 exists
    };
    const { getSignedPlaybackUrl } = await import("@/lib/media-storage");
    expect(await getSignedPlaybackUrl("iv-degraded")).toBeNull();
    // Only the merged key was ever probed; the chunk key is never signed.
    expect(sentCommands.map((c) => c.input.Key)).toEqual(["recordings/iv-degraded/recording.webm"]);
  });
});
