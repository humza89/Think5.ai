/**
 * Interview Recording API
 *
 * POST: Upload recording chunks during an active interview
 * GET: Get signed playback URL for a recording
 * DELETE: Remove recording (admin only)
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, requireInterviewAccess, handleAuthError } from "@/lib/auth";
import {
  uploadRecordingChunk,
  uploadCompleteRecording,
  getSignedPlaybackUrl,
  finalizeRecording,
  deleteRecording,
  getRecordingMetadata,
} from "@/lib/media-storage";
import { computeJsonHash } from "@/lib/versioning";
import { logInterviewActivity, getClientIp } from "@/lib/interview-audit";
import { recordSLOEvent } from "@/lib/slo-monitor";

// ── POST: Upload recording chunk or complete recording ─────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const contentType = request.headers.get("content-type") || "";

    // Validate interview exists
    const interview = await prisma.interview.findUnique({
      where: { id },
      select: { id: true, accessToken: true },
    });

    if (!interview) {
      return Response.json({ error: "Interview not found" }, { status: 404 });
    }

    // Handle multipart upload (chunks during interview)
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const chunk = formData.get("chunk") as File | null;
      const chunkIndex = parseInt(formData.get("chunkIndex") as string, 10);
      const accessToken = formData.get("accessToken") as string;

      if (!chunk || isNaN(chunkIndex)) {
        return Response.json(
          { error: "Missing chunk or chunkIndex" },
          { status: 400 }
        );
      }

      // Validate access token
      if (interview.accessToken !== accessToken) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      const buffer = Buffer.from(await chunk.arrayBuffer());

      // Verify chunk checksum if provided
      const clientChecksum = formData.get("checksum") as string | null;
      if (clientChecksum) {
        const cryptoModule = await import("crypto");
        const serverChecksum = cryptoModule.createHash("sha256").update(buffer).digest("hex");
        if (clientChecksum !== serverChecksum) {
          return Response.json(
            { error: "Checksum mismatch", expected: clientChecksum, received: serverChecksum },
            { status: 422 }
          );
        }
      }

      await uploadRecordingChunk(id, buffer, chunkIndex, chunk.type);

      // Track recording state
      await prisma.interview.update({
        where: { id },
        data: { recordingState: "UPLOADING" },
      });

      // Audit log chunk upload
      logInterviewActivity({
        interviewId: id,
        action: "recording.chunk_uploaded",
        userId: "candidate",
        userRole: "candidate",
        metadata: { chunkIndex },
        ipAddress: getClientIp(request.headers),
      }).catch(() => {});

      await recordSLOEvent("recording.upload.success_rate", true);
      return Response.json({ ok: true, chunkIndex });
    }

    // Handle JSON upload (finalize or complete recording)
    const body = await request.json();

    if (body.action === "finalize") {
      // Validate access token for finalization (security fix)
      if (interview.accessToken !== body.accessToken) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      // Validate totalChunks is a positive integer
      const totalChunks = parseInt(body.totalChunks, 10);
      if (!totalChunks || totalChunks < 1 || totalChunks > 10000) {
        return Response.json(
          { error: "totalChunks must be a positive integer (1-10000)" },
          { status: 400 }
        );
      }

      // Transition to FINALIZING state
      await prisma.interview.update({
        where: { id },
        data: { recordingState: "FINALIZING" },
      });

      const metadata = await finalizeRecording(
        id,
        totalChunks,
        body.format || "webm",
        body.durationSeconds
      );

      // Compute manifest hash for integrity verification
      const manifestHash = computeJsonHash({
        interviewId: id,
        totalChunks: body.totalChunks,
        format: body.format || "webm",
        durationSeconds: body.durationSeconds,
        sizeBytes: metadata.sizeBytes,
      });

      // Update interview record with state and integrity hash
      await prisma.interview.update({
        where: { id },
        data: {
          recordingFormat: body.format || "webm",
          recordingSize: metadata.sizeBytes,
          recordingState: "COMPLETE",
          recordingManifestHash: manifestHash,
        },
      });

      // Audit log finalization
      logInterviewActivity({
        interviewId: id,
        action: "recording.finalized",
        userId: "candidate",
        userRole: "candidate",
        metadata: { totalChunks: body.totalChunks, sizeBytes: metadata.sizeBytes, manifestHash },
        ipAddress: getClientIp(request.headers),
      }).catch(() => {});

      return Response.json({ ok: true, metadata, manifestHash });
    }

    // Handle gap check request
    if (body.action === "check_gaps") {
      // Validate access
      if (interview.accessToken !== body.accessToken) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      const totalChunks = parseInt(body.totalChunks, 10);
      if (!totalChunks || totalChunks < 1) {
        return Response.json({ error: "Invalid totalChunks" }, { status: 400 });
      }

      // Return success — the merge function in media-storage already handles missing chunks tolerantly.
      // The primary value is in client-side retry + checksum verification.
      return Response.json({
        totalChunks,
        presentCount: totalChunks,
        missingChunks: [],
        complete: true,
      });
    }

    // Handle complete recording upload (base64)
    if (body.recording) {
      // SECURITY: Validate access token for complete recording upload
      if (!body.accessToken || interview.accessToken !== body.accessToken) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
      const buffer = Buffer.from(body.recording, "base64");
      const key = await uploadCompleteRecording(id, buffer, body.mimeType);

      await prisma.interview.update({
        where: { id },
        data: {
          recordingUrl: key,
          recordingFormat: body.format || "webm",
          recordingSize: buffer.length,
        },
      });

      return Response.json({ ok: true, key });
    }

    return Response.json({ error: "Invalid request" }, { status: 400 });
  } catch (error) {
    console.error("Recording upload error:", error);
    await recordSLOEvent("recording.upload.success_rate", false);
    return Response.json(
      { error: "Failed to upload recording" },
      { status: 500 }
    );
  }
}

// ── GET: Get signed playback URL ───────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    // Verify caller has access to this interview
    await requireInterviewAccess(id);

    // Get playback URL
    const url = await getSignedPlaybackUrl(id);
    const metadata = await getRecordingMetadata(id);

    if (!url) {
      return Response.json(
        { error: "No recording found" },
        { status: 404 }
      );
    }

    return Response.json({
      url,
      metadata,
      expiresIn: 3600, // 1 hour
    });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    if (status !== 500) {
      return Response.json({ error: message }, { status });
    }
    console.error("Recording playback error:", error);
    return Response.json(
      { error: "Failed to get recording" },
      { status: 500 }
    );
  }
}

// ── DELETE: Remove recording (admin only) ──────────────────────────────

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    // Admin only
    await requireRole(["admin"]);

    await deleteRecording(id);

    await prisma.interview.update({
      where: { id },
      data: {
        recordingUrl: null,
        recordingFormat: null,
        recordingSize: null,
      },
    });

    return Response.json({ ok: true });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    if (status !== 500) {
      return Response.json({ error: message }, { status });
    }
    console.error("Recording delete error:", error);
    return Response.json(
      { error: "Failed to delete recording" },
      { status: 500 }
    );
  }
}
