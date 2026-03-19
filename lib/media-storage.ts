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

  const metadata: RecordingMetadata = {
    interviewId,
    format,
    sizeBytes: totalSize,
    durationSeconds,
    uploadedAt: new Date().toISOString(),
    chunkCount: totalChunks,
  };

  // Store manifest
  await client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: `recordings/${interviewId}/manifest.json`,
      Body: JSON.stringify(metadata),
      ContentType: "application/json",
    })
  );

  // Merge chunks into a single playback file
  try {
    await mergeRecordingChunks(interviewId, totalChunks, format);
  } catch (err) {
    console.error(`Failed to merge chunks for interview ${interviewId}:`, err);
    // Non-fatal — playback falls back to first chunk
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
    } catch {
      // Skip missing chunks
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
 */
export async function getSignedPlaybackUrl(
  interviewId: string,
  expiresInSeconds: number = 3600
): Promise<string | null> {
  const client = getR2Client();

  // Try complete recording first
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
    // No complete recording, try first chunk as fallback
  }

  // Fallback: sign first chunk (for immediate low-res playback)
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
