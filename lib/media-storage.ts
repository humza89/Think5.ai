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
   * Whether the chunk-merge step produced a playable merged file. Recorded in
   * the manifest so every downstream consumer can see the truth; callers must
   * not treat a recording as playable while this is false.
   */
  mergeSucceeded: boolean;
}

/**
 * Thrown by finalizeRecording when every merge attempt failed. The manifest is
 * still written (with mergeSucceeded=false) before this is raised, so the
 * record is durable and the finalize-retry job can pick the interview up.
 *
 * Salvaged from legacy PR #4: the previous behaviour logged the failure and
 * carried on, and getSignedPlaybackUrl then silently served the FIRST CHUNK of
 * the recording as if it were the whole interview.
 */
export class RecordingMergeFailedError extends Error {
  readonly interviewId: string;
  readonly attempts: number;
  constructor(interviewId: string, attempts: number, cause?: unknown) {
    super(`Recording merge failed after ${attempts} attempts for interview ${interviewId}`);
    this.name = "RecordingMergeFailedError";
    this.interviewId = interviewId;
    this.attempts = attempts;
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

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
  // manifest, so the manifest records the real merge outcome.
  const MAX_MERGE_RETRIES = 3;
  let mergeSuccess = false;
  let lastMergeError: unknown = null;
  for (let attempt = 1; attempt <= MAX_MERGE_RETRIES; attempt++) {
    try {
      await mergeRecordingChunks(interviewId, totalChunks, format);
      mergeSuccess = true;
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
    mergeSucceeded: mergeSuccess,
  };

  // Store the manifest — the durable record of what happened, including the
  // merge outcome — even when the merge failed.
  await client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: `recordings/${interviewId}/manifest.json`,
      Body: JSON.stringify(metadata),
      ContentType: "application/json",
    })
  );

  if (!mergeSuccess) {
    const mergeError = new RecordingMergeFailedError(interviewId, MAX_MERGE_RETRIES, lastMergeError);
    Sentry.captureException(mergeError, {
      level: "fatal",
      tags: { component: "recording_merge" },
      extra: { interviewId, totalChunks, totalSize },
    });
    logger.error(
      `[Recording Merge] CRITICAL: All ${MAX_MERGE_RETRIES} merge attempts failed for interview ${interviewId}. ` +
      `Recording is NOT playable; the caller must surface this and retry. Total chunks: ${totalChunks}, total size: ${totalSize} bytes.`
    );
    throw mergeError;
  }

  return metadata;
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
 * Default expiry: 1 hour.
 *
 * Returns null when the merged recording does not exist. It deliberately does
 * NOT fall back to the first chunk: serving a 10MB chunk of a 45-minute
 * interview as if it were the whole recording is a hiring-integrity defect
 * (legacy PR #4). Callers treat null as "recording unavailable".
 */
export async function getSignedPlaybackUrl(
  interviewId: string,
  expiresInSeconds: number = 3600
): Promise<string | null> {
  const client = getR2Client();

  const completeKey = `recordings/${interviewId}/recording.webm`;
  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: completeKey,
      })
    );
  } catch {
    logger.warn(`[Recording Playback] Merged recording missing for interview ${interviewId}; refusing first-chunk fallback`);
    return null;
  }

  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: completeKey,
    }),
    { expiresIn: expiresInSeconds }
  );
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

/**
 * T7: indices in [0, totalChunks) with no object under
 * recordings/{interviewId}/chunks/. Paginates ListObjectsV2.
 */
export async function listMissingChunkIndices(interviewId: string, totalChunks: number): Promise<number[]> {
  if (totalChunks <= 0) return [];
  const client = getR2Client();
  const prefix = `recordings/${interviewId}/chunks/`;
  const present = new Set<number>();
  let continuationToken: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: R2_BUCKET_NAME, Prefix: prefix, ContinuationToken: continuationToken })
    );
    for (const object of page.Contents ?? []) {
      const index = Number.parseInt((object.Key ?? "").slice(prefix.length), 10);
      if (Number.isInteger(index)) present.add(index);
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
  const missing: number[] = [];
  for (let i = 0; i < totalChunks; i++) if (!present.has(i)) missing.push(i);
  return missing;
}
