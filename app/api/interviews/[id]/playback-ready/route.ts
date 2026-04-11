/**
 * GET /api/interviews/[id]/playback-ready — Track 2, Task 11.
 *
 * Preflight endpoint for recruiter playback. The recruiter UI calls
 * this BEFORE rendering the video player so the UI can refuse to
 * render a half-finalized interview as if it were ready.
 *
 * Contract:
 *   Response shape: {
 *     ready: boolean,
 *     reason: string,         // explanation when not ready
 *     missing: string[],      // stages that are blocking, if known
 *     degraded: boolean,      // ready but recording is unavailable
 *     recordingUrl: string?,  // signed URL if ready and playable
 *     status: string          // Interview.status for debugging
 *   }
 *
 * The endpoint is authenticated and tenant-scoped via the helper from
 * Track 1 Task 4. It reads the FinalizationManifest to determine
 * readiness — if no manifest exists (legacy interview finalized before
 * Track 2 shipped), it falls back to the Track 1 invariant checks so
 * recruiters can still access older data safely.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireInterviewAccess, handleAuthError } from "@/lib/auth";
import {
  evaluateManifest,
  type EvaluateResult,
} from "@/lib/finalization-manifest";
import { getSignedPlaybackUrl } from "@/lib/media-storage";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // NOTE: Once Track 1 PR #4 merges, this should migrate to
    // buildInterviewAccessScope() for defense-in-depth tenant isolation.
    // Tracked as a follow-up in the Track 2 PR body.
    await requireInterviewAccess(id);

    const interview = await prisma.interview.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        reportStatus: true,
        recordingUrl: true,
        recordingState: true,
        transcript: true,
      },
    });

    if (!interview) {
      return NextResponse.json({ error: "Interview not found" }, { status: 404 });
    }

    // Fast fail: if the interview is not in a post-finalization state,
    // it's definitely not ready.
    if (interview.status !== "COMPLETED" && interview.status !== "FINALIZING") {
      return NextResponse.json({
        ready: false,
        status: interview.status,
        reason: "interview_not_complete",
        missing: [`status:${interview.status}`],
        degraded: false,
        recordingUrl: null,
      });
    }

    // If a FinalizationManifest exists, it's the authoritative source
    // of truth for readiness.
    let evaluation: EvaluateResult | null = null;
    try {
      evaluation = await evaluateManifest(id);
    } catch {
      // Manifest read failure is non-fatal — fall through to the
      // invariant-based fallback below.
    }

    if (evaluation) {
      if (!evaluation.canComplete) {
        return NextResponse.json({
          ready: false,
          status: interview.status,
          reason: "manifest_incomplete",
          missing: evaluation.missing,
          degraded: false,
          recordingUrl: null,
        });
      }

      // Manifest says ready. Generate a signed playback URL if the
      // recording is supposed to exist. If the manifest says
      // recordingStatus=degraded, we intentionally return null for
      // recordingUrl so the UI shows "recording unavailable" instead
      // of attempting playback.
      let recordingUrl: string | null = null;
      if (
        evaluation.record.recordingStatus === "merged" &&
        interview.recordingUrl !== null
      ) {
        recordingUrl = await getSignedPlaybackUrl(id);
      }

      return NextResponse.json({
        ready: true,
        status: interview.status,
        reason: evaluation.degraded ? "ready_but_recording_degraded" : "ready",
        missing: [],
        degraded: evaluation.degraded,
        recordingUrl,
      });
    }

    // Fallback path: no manifest. This happens for interviews finalized
    // before Track 2 shipped. Enforce the Track 1 invariants inline so
    // recruiters still can't see broken COMPLETED interviews.
    return legacyInvariantCheck(interview, id);
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

async function legacyInvariantCheck(
  interview: {
    id: string;
    status: string;
    reportStatus: string | null;
    recordingUrl: string | null;
    recordingState: string | null;
    transcript: unknown;
  },
  interviewId: string,
): Promise<NextResponse> {
  const missing: string[] = [];

  // Invariant A: report
  const rs = interview.reportStatus;
  if (rs === null || rs === "pending") {
    missing.push("report:not_dispatched");
  }
  // pending/generating are acceptable — recruiter can view transcript

  // Invariant B: recording state matches URL
  if (interview.recordingUrl !== null) {
    if (
      interview.recordingState !== "COMPLETE" &&
      interview.recordingState !== "VERIFIED"
    ) {
      missing.push(`recording:${interview.recordingState ?? "unknown"}`);
    }
  }

  // Invariant C: transcript present
  const transcriptPresent =
    interview.transcript !== null &&
    interview.transcript !== undefined &&
    !(Array.isArray(interview.transcript) && interview.transcript.length === 0);
  if (!transcriptPresent) {
    missing.push("transcript:missing");
  }

  if (missing.length > 0) {
    return NextResponse.json({
      ready: false,
      status: interview.status,
      reason: "legacy_invariant_check_failed",
      missing,
      degraded: false,
      recordingUrl: null,
    });
  }

  // Legacy path looks clean. Generate signed URL.
  const recordingUrl = interview.recordingUrl
    ? await getSignedPlaybackUrl(interviewId)
    : null;

  return NextResponse.json({
    ready: true,
    status: interview.status,
    reason: "legacy_ok",
    missing: [],
    degraded: interview.recordingUrl !== null && recordingUrl === null, // merged missing
    recordingUrl,
  });
}
