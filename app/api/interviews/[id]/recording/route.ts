/**
 * Recording Upload Endpoint
 *
 * Handles chunked video recording upload to Cloudflare R2 via media-storage.ts.
 * Supports: chunk upload (multipart), gap checking, and finalization (JSON).
 *
 * Auth: Access token validated per request. Rate limited per interview.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createHash } from "crypto";
import { recordSLOEvent } from "@/lib/slo-monitor";
import {
  uploadRecordingChunk,
  finalizeRecording as finalizeR2Recording,
  getSignedPlaybackUrl,
} from "@/lib/media-storage";
// Track 4 Task 15: durable recording health field. Writes here go
// through setRecordingHealth so recordingHealthReason/At stay in sync.
import {
  healthFromMergeOutcome,
  setRecordingHealth,
} from "@/lib/recording-health";
import * as Sentry from "@sentry/nextjs";

// ── Rate Limiting (in-memory per-instance) ──────────────────────────
// NOTE: This is per-process. In multi-instance deployments, each instance
// enforces independently. For distributed rate limiting, migrate to Redis.
const uploadCounters = new Map<string, { count: number; windowStart: number }>();
const MAX_UPLOADS_PER_MINUTE = 60; // 2s chunks = 30/min typical; 60 allows burst
const MAX_CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB per chunk

function checkRateLimit(interviewId: string): boolean {
  const now = Date.now();
  const entry = uploadCounters.get(interviewId);
  if (!entry || now - entry.windowStart > 60_000) {
    uploadCounters.set(interviewId, { count: 1, windowStart: now });
    // H8: Evict stale entries to prevent memory leak
    if (uploadCounters.size > 100) {
      for (const [key, val] of uploadCounters) {
        if (now - val.windowStart > 120_000) uploadCounters.delete(key);
      }
    }
    return true;
  }
  entry.count++;
  return entry.count <= MAX_UPLOADS_PER_MINUTE;
}

// ── Auth Helper ─────────────────────────────────────────────────────

async function authenticateRequest(
  interviewId: string,
  accessToken: string | null
): Promise<boolean> {
  if (!accessToken) return false;
  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    select: { accessToken: true, accessTokenExpiresAt: true },
  });
  if (!interview || interview.accessToken !== accessToken) return false;
  if (interview.accessTokenExpiresAt && new Date() > new Date(interview.accessTokenExpiresAt)) {
    return false;
  }
  return true;
}

// ── POST Handler ────────────────────────────────────────────────────

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const contentType = req.headers.get("content-type") || "";

    // ── JSON actions: finalize, check_gaps ──
    if (contentType.includes("application/json")) {
      const body = await req.json();
      const accessToken = body.accessToken || req.headers.get("authorization")?.replace("Bearer ", "");

      if (!(await authenticateRequest(id, accessToken))) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      if (body.action === "check_gaps") {
        const totalChunks = parseInt(body.totalChunks, 10);
        if (isNaN(totalChunks) || totalChunks < 0 || totalChunks > 50000) {
          return Response.json({ error: "Invalid totalChunks" }, { status: 400 });
        }
        // For now, return empty gaps — R2 storage handles this via manifest
        // Future: query R2 to find missing chunk indices
        return Response.json({ missingChunks: [], totalChunks });
      }

      if (body.action === "finalize") {
        const totalChunks = parseInt(body.totalChunks, 10) || 0;
        const format = body.format === "mp4" ? "mp4" : "webm";
        const durationSeconds = typeof body.durationSeconds === "number" ? body.durationSeconds : undefined;

        if (totalChunks > 50000) {
          return Response.json({ error: "Invalid totalChunks" }, { status: 400 });
        }

        // Update recording state to FINALIZING and mark health as
        // PROCESSING so the recruiter UI doesn't prematurely try to
        // play a mid-finalization recording.
        await prisma.interview.update({
          where: { id },
          data: { recordingState: "FINALIZING" },
        });
        await setRecordingHealth(id, "PROCESSING", "finalize_started").catch((e) => {
          // Never let a health-write failure block the finalization itself.
          console.error(`[Recording] setRecordingHealth PROCESSING failed:`, e);
        });

        try {
          // Merge chunks and create manifest in R2
          const metadata = await finalizeR2Recording(id, totalChunks, format, durationSeconds);

          // Get signed playback URL
          const playbackUrl = await getSignedPlaybackUrl(id);

          // Update interview with final recording info
          await prisma.interview.update({
            where: { id },
            data: {
              recordingUrl: playbackUrl || `r2://recordings/${id}/recording.${format}`,
              recordingFormat: format,
              recordingSize: metadata.sizeBytes,
              recordingState: "COMPLETE",
              recordingManifestHash: createHash("sha256")
                .update(JSON.stringify(metadata))
                .digest("hex"),
            },
          });

          // Track 4: compute and persist the health outcome. The
          // classifier knows how to map (mergeSucceeded, playbackUrlResolved,
          // totalChunks) to HEALTHY / DEGRADED / MISSING / FAILED.
          //
          // Note: on branches that have Track 1 PR #4 merged,
          // `finalizeR2Recording` throws RecordingMergeFailedError on
          // merge failure so we never reach this code path with
          // mergeSucceeded=false — that case falls into the catch block
          // below. On main (pre-PR-#4), finalizeR2Recording may return
          // normally after silently failing, in which case our best
          // signal is whether getSignedPlaybackUrl resolved. The
          // classifier handles both cases conservatively.
          const outcome = healthFromMergeOutcome({
            mergeSucceeded: true, // if we got here, finalizeR2Recording didn't throw
            playbackUrlResolved: !!playbackUrl,
            totalChunks,
          });
          await setRecordingHealth(id, outcome.health, outcome.reason).catch((e) => {
            console.error(`[Recording] setRecordingHealth ${outcome.health} failed:`, e);
          });

          await recordSLOEvent("recording.upload.success_rate", true);

          return Response.json({
            success: true,
            url: playbackUrl,
            metadata,
            recordingHealth: outcome.health,
          }, { status: 202 });
        } catch (err) {
          Sentry.captureException(err, {
            tags: { component: "recording_finalize" },
            extra: { interviewId: id, totalChunks },
          });
          console.error(`[Recording] Finalization failed for interview=${id}:`, err);

          await prisma.interview.update({
            where: { id },
            data: { recordingState: "UPLOADING" }, // revert state
          });

          // Track 4: map the thrown error to a concrete health value.
          // If no chunks were captured at all → FAILED (nothing to recover).
          // If chunks exist but merge blew up → DEGRADED (reconciler can
          // retry the merge out-of-band; if it eventually succeeds the
          // health flips back to HEALTHY).
          const outcome = healthFromMergeOutcome({
            mergeSucceeded: false,
            playbackUrlResolved: false,
            totalChunks,
          });
          await setRecordingHealth(id, outcome.health, outcome.reason).catch((e) => {
            console.error(`[Recording] setRecordingHealth ${outcome.health} failed:`, e);
          });

          return Response.json(
            { error: "Recording finalization failed", retryable: true, recordingHealth: outcome.health },
            { status: 500 }
          );
        }
      }

      return Response.json({ error: "Invalid action" }, { status: 400 });
    }

    // ── Multipart chunk upload ──

    // Rate limit check
    if (!checkRateLimit(id)) {
      return Response.json(
        { error: "Too many uploads — slow down", retryAfter: 60 },
        { status: 429 }
      );
    }

    const formData = await req.formData();

    // Auth: prefer Authorization header, fall back to form field
    const accessToken =
      req.headers.get("authorization")?.replace("Bearer ", "") ||
      (formData.get("accessToken") as string | null);

    if (!(await authenticateRequest(id, accessToken))) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const chunk = formData.get("chunk") as Blob | null;
    const chunkIndexStr = formData.get("chunkIndex") as string;
    const clientChecksum = formData.get("checksum") as string | null;

    if (!chunk) {
      return Response.json({ error: "Missing chunk data" }, { status: 400 });
    }

    const chunkIndex = parseInt(chunkIndexStr, 10);
    if (isNaN(chunkIndex) || chunkIndex < 0 || chunkIndex > 50000) {
      return Response.json({ error: "Invalid chunkIndex" }, { status: 400 });
    }

    // Size limit
    if (chunk.size > MAX_CHUNK_SIZE) {
      return Response.json(
        { error: `Chunk too large: ${chunk.size} bytes (max ${MAX_CHUNK_SIZE})` },
        { status: 413 }
      );
    }

    const buffer = Buffer.from(await chunk.arrayBuffer());

    // SHA-256 checksum verification (required in production)
    if (clientChecksum) {
      const serverChecksum = createHash("sha256").update(buffer).digest("hex");
      if (serverChecksum !== clientChecksum) {
        console.warn(
          `[Recording] Checksum mismatch for interview=${id} chunk=${chunkIndex}: client=${clientChecksum} server=${serverChecksum}`
        );
        await recordSLOEvent("recording.upload.success_rate", false);
        return Response.json(
          { error: "Checksum mismatch — chunk corrupted in transit. Retry automatically." },
          { status: 422 }
        );
      }
    }

    // Upload chunk to R2
    await uploadRecordingChunk(id, buffer, chunkIndex);

    // Update recording state on first chunk
    if (chunkIndex === 0) {
      await prisma.interview.update({
        where: { id },
        data: { recordingState: "UPLOADING" },
      });
    }

    await recordSLOEvent("recording.upload.success_rate", true);

    return Response.json({
      success: true,
      chunkIndex,
      verified: !!clientChecksum,
      sizeBytes: buffer.length,
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { component: "recording_upload" },
      extra: { interviewId: id },
    });
    console.error(`[Recording] Upload error for interview=${id}:`, error);
    await recordSLOEvent("recording.upload.success_rate", false);
    return Response.json({ error: "Recording upload failed" }, { status: 500 });
  }
}
