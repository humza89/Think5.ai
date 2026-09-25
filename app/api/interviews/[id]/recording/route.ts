/**
 * Recording Upload Endpoint
 *
 * Handles chunked video recording upload to Cloudflare R2 via media-storage.ts.
 * Supports: chunk upload (multipart), gap checking, and finalization (JSON).
 *
 * Auth: Access token validated per request. Rate limited per interview.
 */

import { recordUsage } from "@/lib/usage/meter";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createHash } from "crypto";
import { recordSLOEvent } from "@/lib/slo-monitor";
import {
  uploadRecordingChunk,
  finalizeRecording as finalizeR2Recording,
  getSignedPlaybackUrl,
} from "@/lib/media-storage";
import * as Sentry from "@sentry/nextjs";
import { checkInterviewCredential, resolveInterviewCredential, type InterviewCredential } from "@/lib/interview-credential";

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
  credential: InterviewCredential | null
): Promise<boolean> {
  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    select: { accessToken: true, accessTokenExpiresAt: true },
  });
  if (!interview) return false;
  return checkInterviewCredential(interview, credential) === null;
}

// ── POST Handler ────────────────────────────────────────────────────

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const contentType = req.headers.get("content-type") || "";

    // ── JSON actions: finalize, check_gaps ──
    if (contentType.includes("application/json")) {
      const body = await req.json();
      // T2: cookie, header, body or query
      if (!(await authenticateRequest(id, resolveInterviewCredential(req, id, body)))) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      if (body.action === "check_gaps") {
        const totalChunks = parseInt(body.totalChunks, 10);
        if (isNaN(totalChunks) || totalChunks < 0 || totalChunks > 50000) {
          return Response.json({ error: "Invalid totalChunks" }, { status: 400 });
        }
        // T7: list the interview's chunk objects in R2 and report the missing
        // indices so the client can re-upload before finalize.
        try {
          const { listMissingChunkIndices } = await import("@/lib/media-storage");
          const missingChunks = await listMissingChunkIndices(id, totalChunks);
          return Response.json({ missingChunks, totalChunks });
        } catch (gapError) {
          // R2 not configured (local/dev): keep the previous permissive answer.
          console.warn("[recording] check_gaps unavailable:", gapError instanceof Error ? gapError.message : gapError);
          return Response.json({ missingChunks: [], totalChunks, gapCheck: "unavailable" });
        }
      }

      if (body.action === "finalize") {
        const totalChunks = parseInt(body.totalChunks, 10) || 0;
        const format = body.format === "mp4" ? "mp4" : "webm";
        const durationSeconds = typeof body.durationSeconds === "number" ? body.durationSeconds : undefined;

        if (totalChunks > 50000) {
          return Response.json({ error: "Invalid totalChunks" }, { status: 400 });
        }

        // Update recording state to FINALIZING
        await prisma.interview.update({
          where: { id },
          data: { recordingState: "FINALIZING" },
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

          await recordSLOEvent("recording.upload.success_rate", true);

          // T7: the recordingProcess job had no producer; publish the event
          // so post-processing runs durably. Non-fatal if Inngest is down.
          try {
            const { inngest } = await import("@/inngest/client");
            await inngest.send({
              name: "interview/recording.ready",
              data: { interviewId: id, totalChunks, format, sizeBytes: metadata.sizeBytes },
            });
          } catch (publishError) {
            console.warn("[recording] could not publish interview/recording.ready:", publishError instanceof Error ? publishError.message : publishError);
          }
          // T16: storage usage for the finalized recording (idempotent per interview).
          const owner = await prisma.interview.findUnique({ where: { id }, select: { companyId: true } });
          await recordUsage({ id: `recording:${id}:finalize`, tenantId: owner?.companyId, kind: "storage.bytes", quantity: metadata.sizeBytes, subjectId: id, source: "api:recording", metadata: { format } });

          return Response.json({
            success: true,
            url: playbackUrl,
            metadata,
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

          return Response.json(
            { error: "Recording finalization failed", retryable: true },
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

    // Auth (T2): header, form field, query or cookie
    const formCredential = { accessToken: formData.get("accessToken") as string | null };
    if (!(await authenticateRequest(id, resolveInterviewCredential(req, id, formCredential)))) {
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
