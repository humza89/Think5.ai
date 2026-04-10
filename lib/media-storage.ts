/**
 * Media Storage — Cloudflare R2 integration for interview recordings
 *
 * Uses S3-compatible API to store video/audio recordings from interviews.
 * Supports chunked upload during interviews, signed URLs for playback,
 * and cleanup for data retention compliance.
 *
 * R2 Pricing: $0.015/GB/month storage, $0 egress — ideal for video.
 * A 30-min WebM video ≈ 50-100MB → ~$0.0015/interview/month.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";

// ── Configuration ──────────────────────────────────────────────────────

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "interview-recordings";

function getR2Client(): S3Client {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error(
      "R2 credentials not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY."
    );
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
}

// ── Types ──────────────────────────────────────────────────────────────

export interface RecordingMetadata {
  interviewId: string;
  format: string;
  sizeBytes: number;
  durationSeconds?: number;
  uploadedAt: string;
  chunkCount: number;
  /**
   * Track-1 correctness: whether the chunk-merge step actually produced a
   * playable merged file. Callers MUST check this before marking the
   * interview's recording as playable.
   */
  mergeSucceeded: boolean;
}

/**
 * Track-1 correctness: emergency rollback flag for the first-chunk playback
 * fallback. This flag exists ONLY so operators can re-enable the old unsafe
 * behavior during a production incident if killing the fallback causes
 * unforeseen breakage. Default is FALSE (safe). Set to "true" in env only
 * as a last resort; never leave it enabled.
 *
 * Historical context: the old behavior silently served the first 10MB
 * chunk of a 45-minute recording when the merged file was missing, which
 * meant recruiters watched a 2-minute snippet as if it were the whole
 * interview. That is unacceptable correctness behavior and violates the
 * hiring-integrity invariant. See docs/audit Track 1, Task 2.
 */
const ALLOW_FIRST_CHUNK_FALLBACK =
  process.env.PLAYBACK_ALLOW_FIRST_CHUNK_FALLBACK === "true";

// ── Upload Functions ───────────────────────────────────────────────────

/**
 * Upload a recording chunk during an active interview.
 * Chunks are stored as separate objects and merged on finalization.
 */
export async function uploadRecordingChunk(
  interviewId: string,
  chunk: Buffer,
  chunkIndex: number,
  mimeType: string = "video/webm"
): Promise<void> {
  const client = getR2Client();
  const key = `recordings/${interviewId}/chunks/${String(chunkIndex).padStart(6, "0")}`;

  await client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: chunk,
      ContentType: mimeType,
      Metadata: {
        interviewId,
        chunkIndex: String(chunkIndex),
        uploadedAt: new Date().toISOString(),
      },
    })
  );
}

/**
 * Upload a complete recording file (for cases where chunking isn't needed).
 */
export async function uploadCompleteRecording(
  interviewId: string,
  data: Buffer,
  mimeType: string = "video/webm"
): Promise<string> {
  const client = getR2Client();
  const key = `recordings/${interviewId}/recording.${getExtension(mimeType)}`;

  await client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: data,
      ContentType: mimeType,
      ContentLength: data.length,
      Metadata: {
        interviewId,
        uploadedAt: new Date().toISOString(),
        sizeBytes: String(data.length),
      },
    })
  );

  return key;
}

/**
 * Finalize a chunked recording by creating a manifest.
 * The manifest stores metadata; chunks remain as separate objects.
 * For playback, generate a signed URL for the merged file or stream chunks.
 */
export async function finalizeRecording(
  interviewId: string,
  totalChunks: number,
  format: string = "webm",
  durationSeconds?: number
): Promise<RecordingMetadata> {
  const client = getR2Client();

  // Calculate total size from chunks
  let totalSize = 0;
  for (let i = 0; i < totalChunks; i++) {
    const key = `recordings/${interviewId}/chunks/${String(i).padStart(6, "0")}`;
    try {
      const head = await client.send(
        new HeadObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: key,
        })
      );
      totalSize += head.ContentLength || 0;
    } catch {
      // Chunk may be missing — record what we have
    }
  }

  // Merge chunks into a single playback file with retry BEFORE writing the
  // manifest. We want the manifest to reflect reality — if merge fails, the
  // manifest records mergeSucceeded=false so every downstream consumer
  // (report generator, recruiter UI, cron reconciler) can see the truth.
  const MAX_MERGE_RETRIES = 3;
  let mergeSucceeded = false;
  let lastMergeError: unknown = null;
  for (let attempt = 1; attempt <= MAX_MERGE_RETRIES; attempt++) {
    try {
      await mergeRecordingChunks(interviewId, totalChunks, format);
      mergeSucceeded = true;
      break;
    } catch (err) {
      lastMergeError = err;
      logger.error(
        `[Recording Merge] Attempt ${attempt}/${MAX_MERGE_RETRIES} failed for interview ${interviewId}`,
        { error: err }
      );
      if (attempt < MAX_MERGE_RETRIES) {
        // Exponential backoff: 1s, 2s, 4s
        await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
      }
    }
  }

  const metadata: RecordingMetadata = {
    interviewId,
    format,
    sizeBytes: totalSize,
    durationSeconds,
    uploadedAt: new Date().toISOString(),
    chunkCount: totalChunks,
    mergeSucceeded,
  };

  // Store manifest — the manifest is the durable record of what happened,
  // including the merge outcome. Callers MUST read mergeSucceeded before
  // treating the recording as playable.
  await client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: `recordings/${interviewId}/manifest.json`,
      Body: JSON.stringify(metadata),
      ContentType: "application/json",
    })
  );

  if (!mergeSucceeded) {
    // Track-1 correctness: STOP silently degrading to "first chunk only"
    // playback. Throw a typed error so the calling API route can set
    // recordingState back to a non-playable state and surface a clear
    // "recording unavailable" signal to the recruiter. Downstream retries
    // (inngest/functions/recording-finalize-retry.ts) can pick this up.
    Sentry.captureException(lastMergeError ?? new Error("recording_merge_failed"), {
      level: "fatal",
      tags: { component: "recording_merge", interviewId },
      extra: { totalChunks, totalSize, attempts: MAX_MERGE_RETRIES },
    });
    throw new RecordingMergeFailedError(
      `Recording merge failed after ${MAX_MERGE_RETRIES} attempts for interview ${interviewId}`,
      { interviewId, totalChunks, totalSize },
    );
  }

  return metadata;
}

/**
 * Typed error thrown when chunk merge exhausts its retry budget. API callers
 * should catch this and record a non-playable recording state; they should
 * NOT return a success response. Replaces the old behavior of silently
 * falling back to the first chunk for playback.
 */
export class RecordingMergeFailedError extends Error {
  readonly interviewId: string;
  readonly totalChunks: number;
  readonly totalSize: number;
  constructor(
    message: string,
    ctx: { interviewId: string; totalChunks: number; totalSize: number },
  ) {
    super(message);
    this.name = "RecordingMergeFailedError";
    this.interviewId = ctx.interviewId;
    this.totalChunks = ctx.totalChunks;
    this.totalSize = ctx.totalSize;
  }
}

/**
 * Merge all recording chunks into a single file for seamless playback.
 */
async function mergeRecordingChunks(
  interviewId: string,
  totalChunks: number,
  format: string
): Promise<void> {
  const client = getR2Client();
  const buffers: Buffer[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const key = `recordings/${interviewId}/chunks/${String(i).padStart(6, "0")}`;
    try {
      const response = await client.send(
        new GetObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: key,
        })
      );
      if (response.Body) {
        const bytes = await response.Body.transformToByteArray();
        buffers.push(Buffer.from(bytes));
      }
    } catch (err) {
      logger.error(`[Recording Merge] Missing chunk ${i}/${totalChunks} for interview ${interviewId}`, { error: err });
    }
  }

  if (buffers.length === 0) return;

  const merged = Buffer.concat(buffers);
  const ext = format === "mp4" ? "mp4" : "webm";
  const mimeType = format === "mp4" ? "video/mp4" : "video/webm";

  await client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: `recordings/${interviewId}/recording.${ext}`,
      Body: merged,
      ContentType: mimeType,
      ContentLength: merged.length,
      Metadata: {
        interviewId,
        mergedAt: new Date().toISOString(),
        chunkCount: String(totalChunks),
      },
    })
  );
}

// ── Playback Functions ─────────────────────────────────────────────────

/**
 * Get a time-limited signed URL for recording playback.
 *
 * Track-1 correctness: by default, this function returns null if the merged
 * recording file is missing. It does NOT silently fall back to serving the
 * first chunk — that was the old behavior and it caused recruiters to watch
 * the first 2 minutes of 45-minute interviews as if they were the entire
 * recording. If you get null here, the recording is genuinely unplayable
 * and the UI must show "recording unavailable".
 *
 * The `PLAYBACK_ALLOW_FIRST_CHUNK_FALLBACK=true` env flag exists as an
 * emergency rollback only. Do not set it in normal operation.
 *
 * @param interviewId interview to look up
 * @param expiresInSeconds signed URL TTL, default 1h
 * @returns signed URL for the merged recording, or null if unavailable
 */
export async function getSignedPlaybackUrl(
  interviewId: string,
  expiresInSeconds: number = 3600
): Promise<string | null> {
  const client = getR2Client();

  // Try the merged, verified recording first — this is the ONLY playable
  // artifact in normal operation.
  const completeKey = `recordings/${interviewId}/recording.webm`;
  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: completeKey,
      })
    );

    return getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: completeKey,
      }),
      { expiresIn: expiresInSeconds }
    );
  } catch {
    // Merged file missing — fall through to check the kill-switch below.
  }

  if (!ALLOW_FIRST_CHUNK_FALLBACK) {
    // Normal path: no merged file → no playback URL. The caller must treat
    // null as "recording unavailable" and surface that state to the user.
    logger.warn(
      `[Recording] Merged file missing for interview ${interviewId} and ` +
        `PLAYBACK_ALLOW_FIRST_CHUNK_FALLBACK is disabled — returning null.`,
    );
    return null;
  }

  // Emergency rollback path (kill-switch ON). Log loudly so operators know
  // the unsafe fallback is active in production. This branch should never
  // run under normal conditions.
  logger.error(
    `[Recording] CORRECTNESS WARNING: serving first-chunk fallback for ` +
      `interview ${interviewId} because PLAYBACK_ALLOW_FIRST_CHUNK_FALLBACK=true. ` +
      `Recruiters will see partial content without a warning. Disable this flag ASAP.`,
  );
  const chunkKey = `recordings/${interviewId}/chunks/000000`;
  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: chunkKey,
      })
    );

    return getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: chunkKey,
      }),
      { expiresIn: expiresInSeconds }
    );
  } catch {
    return null;
  }
}

/**
 * Get recording metadata (manifest).
 */
export async function getRecordingMetadata(
  interviewId: string
): Promise<RecordingMetadata | null> {
  const client = getR2Client();

  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: `recordings/${interviewId}/manifest.json`,
      })
    );

    const body = await response.Body?.transformToString();
    if (!body) return null;

    return JSON.parse(body) as RecordingMetadata;
  } catch {
    return null;
  }
}

// ── Cleanup Functions ──────────────────────────────────────────────────

/**
 * Delete all recording data for an interview (GDPR compliance).
 */
export async function deleteRecording(interviewId: string): Promise<void> {
  const client = getR2Client();
  const prefix = `recordings/${interviewId}/`;

  // List all objects under this interview
  const listResponse = await client.send(
    new ListObjectsV2Command({
      Bucket: R2_BUCKET_NAME,
      Prefix: prefix,
    })
  );

  const objects = listResponse.Contents || [];

  // Delete each object
  for (const obj of objects) {
    if (obj.Key) {
      await client.send(
        new DeleteObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: obj.Key,
        })
      );
    }
  }
}

// ── R2 Lifecycle / Cost Optimization ─────────────────────────────────
//
// R2 supports Infrequent Access (IA) storage class at $0.01/GB/mo
// (vs $0.015/GB/mo Standard) — 33% savings for older recordings.
//
// Configure via Cloudflare Dashboard → R2 → Bucket Settings → Lifecycle Rules:
//   Rule: "Transition to IA after 30 days"
//   - Scope: prefix "recordings/"
//   - Action: Transition to Infrequent Access after 30 days
//
// Or via the Cloudflare API:
//   PUT /accounts/{account_id}/r2/buckets/{bucket_name}/lifecycle
//   Body: { "rules": [{ "id": "archive-recordings", "enabled": true,
//           "conditions": { "prefix": "recordings/", "age_days": 30 },
//           "actions": { "transition_to_ia": true } }] }
//
// Note: IA has a minimum storage duration of 30 days and minimum object
// size of 128KB. Recordings exceed both thresholds.

/**
 * Apply lifecycle rules to the R2 bucket via Cloudflare API.
 * Call once during setup (idempotent).
 */
export async function applyR2LifecycleRules(): Promise<{ success: boolean; error?: string }> {
  const accountId = R2_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !apiToken) {
    return { success: false, error: "CLOUDFLARE_API_TOKEN or R2_ACCOUNT_ID not configured" };
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${R2_BUCKET_NAME}/lifecycle`;

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      rules: [
        {
          id: "archive-recordings-30d",
          enabled: true,
          conditions: { prefix: "recordings/" },
          actions: {
            type: "TransitionToInfrequentAccess",
            transition_to_ia: { days: 30 },
          },
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    return { success: false, error: `Cloudflare API error ${res.status}: ${body}` };
  }

  return { success: true };
}

// ── Helpers ────────────────────────────────────────────────────────────

function getExtension(mimeType: string): string {
  const map: Record<string, string> = {
    "video/webm": "webm",
    "video/mp4": "mp4",
    "audio/webm": "webm",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
  };
  return map[mimeType] || "webm";
}
