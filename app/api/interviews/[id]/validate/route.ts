import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkCandidateEligibility } from "@/lib/interview-eligibility";
import { logInterviewActivity, getClientIp } from "@/lib/interview-audit";
import { checkRateLimit } from "@/lib/rate-limit";
// Track 5 Task 20: bind an access token to the first device that
// successfully validates and reject mismatches as leaked-URL replays.
import {
  computeCandidateFingerprint,
  fingerprintsMatch,
  extractClientIp,
} from "@/lib/candidate-token-security";
import { logger } from "@/lib/logger";

// Track 5 Task 20: rate limit candidate validate attempts per
// (ip, interviewId). A brute-force attempt across 10,000 tokens from
// one IP would need 500 full windows — enough time for on-call to
// notice via the audit log.
const VALIDATE_RATE_LIMIT = {
  maxRequests: 20,
  windowMs: 60_000,
} as const;

/**
 * PATCH: Persist device readiness verification result.
 * Called by InterviewPreCheck after all device checks pass.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Track 5 Task 20: rate limit token-based PATCH attempts too.
    const clientIp = extractClientIp(request.headers);
    const rl = await checkRateLimit(
      `validate-patch:${clientIp}:${id}`,
      VALIDATE_RATE_LIMIT,
    );
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Please wait a moment and try again." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
          },
        },
      );
    }

    const body = await request.json();
    const { accessToken, action } = body;

    if (!accessToken) {
      return NextResponse.json({ error: "Access token is required" }, { status: 400 });
    }

    const interview = await prisma.interview.findUnique({
      where: { id },
      select: { accessToken: true, accessTokenExpiresAt: true, isPractice: true },
    });

    if (!interview || interview.accessToken !== accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (interview.accessTokenExpiresAt && new Date() > new Date(interview.accessTokenExpiresAt)) {
      return NextResponse.json({ error: "Access token has expired" }, { status: 401 });
    }

    if (action === "readiness_verified") {
      await prisma.interview.update({
        where: { id },
        data: { readinessVerified: true },
      });

      logInterviewActivity({
        interviewId: id,
        action: "interview.readiness_verified",
        userId: id,
        userRole: "candidate",
        ipAddress: getClientIp(request.headers),
      }).catch(() => {});

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Readiness verification error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    // Track 5 Task 20: rate limit brute-force token guessing.
    // Key = (ip, interviewId) so a legitimate candidate hitting their
    // own interview won't DOS themselves, but an attacker scanning
    // tokens for a known id gets throttled after 20 attempts/min.
    const clientIp = extractClientIp(request.headers);
    const rl = await checkRateLimit(
      `validate:${clientIp}:${id}`,
      VALIDATE_RATE_LIMIT,
    );
    if (!rl.allowed) {
      logger.warn(
        `[Validate] Rate-limited candidate validate ip=${clientIp} interview=${id}`,
      );
      return NextResponse.json(
        { error: "Too many attempts. Please wait a moment and try again." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
          },
        },
      );
    }

    const body = await request.json();
    const { consentRecording, consentProctoring, consentPrivacy } = body;

    // Accept token from body (backward compat) or HttpOnly session cookie (secure)
    let accessToken = body.accessToken as string | undefined;
    if (!accessToken) {
      const sessionCookie = request.cookies.get("interview-session")?.value;
      if (sessionCookie) {
        const [cookieId, cookieToken] = sessionCookie.split(":");
        if (cookieId === id && cookieToken) {
          accessToken = cookieToken;
        }
      }
    }

    if (!accessToken) {
      return NextResponse.json(
        { error: "Access token is required" },
        { status: 400 }
      );
    }

    const interview = await prisma.interview.findUnique({
      where: { id },
      include: {
        candidate: {
          select: {
            id: true,
            fullName: true,
            currentTitle: true,
            profileImage: true,
            onboardingStatus: true,
          },
        },
        template: {
          select: {
            aiConfig: true,
            durationMinutes: true,
            readinessCheckRequired: true,
            screenShareRequired: true,
            mode: true,
            candidateReportPolicy: true,
            retakePolicy: true,
            maxDurationMinutes: true,
          },
        },
        job: {
          select: { title: true },
        },
        company: {
          select: {
            name: true,
            logoUrl: true,
            companyLogoCdnUrl: true,
            brandColor: true,
          },
        },
      },
    });

    if (!interview) {
      return NextResponse.json(
        { error: "Interview not found" },
        { status: 404 }
      );
    }

    if (interview.accessToken !== accessToken) {
      // Audit failed attempts so brute-force scans show up in logs
      // even when rate limit absorbs the volume.
      logInterviewActivity({
        interviewId: id,
        action: "interview.validate_bad_token",
        userId: "anonymous",
        userRole: "candidate",
        ipAddress: clientIp,
      }).catch(() => {});
      return NextResponse.json(
        { error: "Invalid access token" },
        { status: 401 }
      );
    }

    // Check token expiry
    if (
      interview.accessTokenExpiresAt &&
      new Date() > new Date(interview.accessTokenExpiresAt)
    ) {
      return NextResponse.json(
        { error: "Access token has expired" },
        { status: 401 }
      );
    }

    // Track 5 Task 20: device fingerprint binding. The first successful
    // validate stamps a fingerprint derived from (token + UA + IP /24).
    // Subsequent validates on the same token MUST match — this is the
    // leaked-URL replay defense. A legitimate candidate reconnecting
    // from the same browser / same /24 passes; a URL copied to a
    // different device / network fails.
    //
    // Gated by TRACK_5_TOKEN_BINDING env flag so the rollout is safe.
    // When enabled, the fingerprint is stamped on first validate and
    // enforced on every subsequent validate.
    const tokenBindingEnabled = process.env.TRACK_5_TOKEN_BINDING === "true";
    if (tokenBindingEnabled) {
      const currentFingerprint = computeCandidateFingerprint({
        accessToken,
        userAgent: request.headers.get("user-agent"),
        ip: clientIp,
      });
      const storedFingerprint = interview.candidateDeviceFingerprint;
      if (storedFingerprint && !fingerprintsMatch(storedFingerprint, currentFingerprint)) {
        // Different device — this is either a legitimate cross-device
        // move (rare for interviews in flight) or a leaked URL. Reject
        // and emit a high-signal audit event.
        logger.warn(
          `[Validate] Fingerprint mismatch interview=${id} ip=${clientIp}`,
        );
        logInterviewActivity({
          interviewId: id,
          action: "interview.validate_fingerprint_mismatch",
          userId: interview.candidate.id,
          userRole: "candidate",
          ipAddress: clientIp,
        }).catch(() => {});
        return NextResponse.json(
          {
            error: "This interview link is already active on another device.",
            recoverable: false,
          },
          { status: 403 },
        );
      }
      if (!storedFingerprint) {
        // First successful validate — stamp the fingerprint.
        await prisma.interview.update({
          where: { id },
          data: { candidateDeviceFingerprint: currentFingerprint },
        });
      }
    }

    if (interview.status === "COMPLETED") {
      return NextResponse.json(
        { error: "Interview already completed", status: interview.status },
        { status: 400 }
      );
    }

    if (interview.status === "CANCELLED" || interview.status === "EXPIRED") {
      return NextResponse.json(
        { error: "Interview is no longer available", status: interview.status },
        { status: 400 }
      );
    }

    // Check candidate eligibility for official interviews
    const eligibility = checkCandidateEligibility(interview);
    if (!eligibility.eligible) {
      return NextResponse.json(
        { error: eligibility.reason },
        { status: 403 }
      );
    }

    // Persist recording consent + accommodations — REQUIRED, not best-effort
    const { accommodations } = body;
    if (consentRecording !== undefined || consentProctoring !== undefined || consentPrivacy !== undefined || accommodations) {
      try {
        await prisma.interview.update({
          where: { id },
          data: {
            ...(consentRecording !== undefined && { consentRecording }),
            ...(consentProctoring !== undefined && { consentProctoring }),
            ...(consentPrivacy !== undefined && { consentPrivacy }),
            ...(accommodations && { accommodations }),
            consentedAt: new Date(),
          },
        });
      } catch (consentError) {
        console.error("Failed to persist consent:", consentError);
        return NextResponse.json(
          { error: "Failed to save consent. Please try again." },
          { status: 500 }
        );
      }
    }

    // Extract proctoring config from template aiConfig
    const aiConfig = (interview.template?.aiConfig as Record<string, unknown>) || {};

    // Audit log: successful validation
    logInterviewActivity({
      interviewId: id,
      action: "interview.validated",
      userId: interview.candidate.id,
      userRole: "candidate",
      metadata: { isPractice: interview.isPractice },
      ipAddress: getClientIp(request.headers),
    }).catch(() => {}); // Fire-and-forget

    return NextResponse.json({
      id: interview.id,
      type: interview.type,
      status: interview.status,
      candidateName: interview.candidate.fullName,
      candidateTitle: interview.candidate.currentTitle,
      candidateImage: interview.candidate.profileImage,
      hasTranscript: !!interview.transcript,
      duration: interview.template?.durationMinutes || 30,
      voiceProvider: interview.voiceProvider,
      jobTitle: interview.job?.title || null,
      durationMinutes: interview.template?.durationMinutes || 30,
      isPractice: interview.isPractice,
      // Readiness and accommodations
      readinessRequired: interview.template?.readinessCheckRequired || false,
      readinessVerified: interview.readinessVerified || false,
      accommodations: interview.accommodations || null,
      // Proctoring config from template — map antiCheatLevel to proctoringLevel
      proctoringLevel: aiConfig.antiCheatLevel
        ? ({ relaxed: "light", standard: "strict", strict: "strict" } as Record<string, string>)[aiConfig.antiCheatLevel as string] || "strict"
        : (aiConfig.proctoringLevel as string) || "strict",
      pastePolicy: aiConfig.pastePolicy || "block",
      maxPasteWarnings: aiConfig.maxPasteWarnings || 3,
      // Template-level config for interview room
      screenShareRequired: interview.template?.screenShareRequired || false,
      templateMode: interview.template?.mode || null,
      candidateReportPolicy: interview.template?.candidateReportPolicy || null,
      retakePolicy: interview.template?.retakePolicy || null,
      maxDurationMinutes: interview.template?.maxDurationMinutes || interview.template?.durationMinutes || 30,
      // P2-2: Company branding for white-labeling
      companyName: interview.company?.name || null,
      companyLogo: interview.company?.companyLogoCdnUrl || interview.company?.logoUrl || null,
      brandColor: interview.company?.brandColor || null,
      // Include transcript for message restoration on resume
      ...(interview.status === "IN_PROGRESS" && interview.transcript
        ? { transcript: interview.transcript }
        : {}),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Interview validation error:", {
      interviewId: id,
      errorMessage,
      errorName: error instanceof Error ? error.name : typeof error,
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Surface DB connectivity issues as 503 for better UX
    if (
      errorMessage.includes("connect") ||
      errorMessage.includes("ECONNREFUSED") ||
      errorMessage.includes("timed out") ||
      errorMessage.includes("Connection pool")
    ) {
      return NextResponse.json(
        { error: "Service temporarily unavailable. Please try again." },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
