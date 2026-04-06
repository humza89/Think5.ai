import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { prisma } from "@/lib/prisma";
import { createHash } from "crypto";
import { logActivity } from "@/lib/activity-log";
import * as Sentry from "@sentry/nextjs";

const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500MB
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60 * 48; // 48 hours

export async function POST(req: NextRequest) {
  try {
    // Validate interview-specific access token (Bearer token from voice session)
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const interviewIdFromHeader = req.headers.get("x-interview-id");

    // Support both Bearer token and authenticated user flows
    let interviewId: string;
    let candidateId: string;

    if (token && interviewIdFromHeader) {
      // Token-based access (during interview)
      const interview = await prisma.interview.findUnique({
        where: { id: interviewIdFromHeader },
        select: { id: true, accessToken: true, candidateId: true, accessTokenExpiresAt: true, consentRecording: true },
      });

      if (!interview || interview.accessToken !== token) {
        return NextResponse.json({ error: "Invalid access token" }, { status: 401 });
      }

      if (interview.accessTokenExpiresAt && interview.accessTokenExpiresAt < new Date()) {
        return NextResponse.json({ error: "Access token expired" }, { status: 401 });
      }

      // Enforce recording consent — reject uploads when consent not given
      if (!interview.consentRecording) {
        return NextResponse.json(
          { error: "Recording consent not given. Upload rejected." },
          { status: 403 }
        );
      }

      interviewId = interview.id;
      candidateId = interview.candidateId;
    } else {
      // Fallback: authenticated user flow
      const { getAuthenticatedUser } = await import("@/lib/auth");
      const { user, profile } = await getAuthenticatedUser();

      if (!user || profile?.role !== "candidate") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const formData = await req.formData();
      const formInterviewId = formData.get("interviewId") as string;
      if (!formInterviewId) {
        return NextResponse.json({ error: "Missing interviewId" }, { status: 400 });
      }

      // Verify candidate owns this interview
      const interview = await prisma.interview.findUnique({
        where: { id: formInterviewId },
        select: { id: true, candidateId: true, candidate: { select: { supabaseUserId: true } } },
      });

      if (!interview || interview.candidate?.supabaseUserId !== user.id) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }

      interviewId = interview.id;
      candidateId = interview.candidateId;
    }

    const formData = token ? await req.formData() : await req.formData().catch(() => null);
    const file = formData?.get("video") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Missing video file" }, { status: 400 });
    }

    // Enforce file size limit
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 500MB." },
        { status: 413 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Compute checksum for integrity verification
    const checksum = createHash("sha256").update(buffer).digest("hex");

    // Upload to Supabase Storage
    const supabase = await createSupabaseServerClient();
    const fileName = `${interviewId}/${Date.now()}_recording.webm`;

    const { error: uploadError } = await supabase.storage
      .from("secure-recordings")
      .upload(fileName, buffer, {
        contentType: file.type || "video/webm",
      });

    if (uploadError) {
      Sentry.captureException(uploadError, { extra: { interviewId } });
      return NextResponse.json({ error: "Failed to upload recording to storage." }, { status: 500 });
    }

    // Generate short-lived signed URL (48 hours, not 1 year)
    const urlResponse = await supabase.storage
      .from("secure-recordings")
      .createSignedUrl(fileName, SIGNED_URL_EXPIRY_SECONDS);

    const recordingUrl = urlResponse.data?.signedUrl || "";

    // Save to Interview record with integrity metadata
    await prisma.interview.update({
      where: { id: interviewId },
      data: {
        videoUrl: recordingUrl,
        recordingUrl: recordingUrl,
        recordingSize: buffer.byteLength,
        recordingManifestHash: checksum,
        recordingFormat: "webm",
      },
    });

    // Audit log
    await logActivity({
      userId: candidateId,
      userRole: "candidate",
      action: "recording.uploaded",
      entityType: "Interview",
      entityId: interviewId,
      metadata: { fileSize: buffer.byteLength, checksum, format: file.type },
    });

    return NextResponse.json({
      success: true,
      message: "Recording securely uploaded and saved.",
      checksum,
    });
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
