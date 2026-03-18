/**
 * Interview Recording API
 *
 * POST: Upload recording chunks during an active interview
 * GET: Get signed playback URL for a recording
 * DELETE: Remove recording (admin only)
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  uploadRecordingChunk,
  uploadCompleteRecording,
  getSignedPlaybackUrl,
  finalizeRecording,
  deleteRecording,
  getRecordingMetadata,
} from "@/lib/media-storage";

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
      await uploadRecordingChunk(id, buffer, chunkIndex, chunk.type);

      return Response.json({ ok: true, chunkIndex });
    }

    // Handle JSON upload (finalize or complete recording)
    const body = await request.json();

    if (body.action === "finalize") {
      const metadata = await finalizeRecording(
        id,
        body.totalChunks,
        body.format || "webm",
        body.durationSeconds
      );

      // Update interview record
      await prisma.interview.update({
        where: { id },
        data: {
          recordingFormat: body.format || "webm",
          recordingSize: metadata.sizeBytes,
        },
      });

      return Response.json({ ok: true, metadata });
    }

    // Handle complete recording upload (base64)
    if (body.recording) {
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
    console.error("Recording delete error:", error);
    return Response.json(
      { error: "Failed to delete recording" },
      { status: 500 }
    );
  }
}
