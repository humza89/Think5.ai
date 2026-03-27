/**
 * Evidence Bundle API
 *
 * GET  — Export the canonical evidence bundle for an interview.
 * POST — Trigger (re)compilation of the evidence bundle.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireInterviewAccess, handleAuthError, getAuthenticatedUser } from "@/lib/auth";
import { logInterviewActivity, getClientIp } from "@/lib/interview-audit";

// GET — Export evidence bundle
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await requireInterviewAccess(id);

    // Audit trail: log evidence bundle access
    const { user, profile } = await getAuthenticatedUser();
    logInterviewActivity({
      interviewId: id,
      action: "evidence_bundle.accessed",
      userId: user.id,
      userRole: profile.role,
      ipAddress: getClientIp(request.headers),
    }).catch(() => {});

    const bundle = await prisma.evidenceBundle.findUnique({
      where: { interviewId: id },
    });

    if (!bundle) {
      // Fall back to JSON blob on Interview if EvidenceBundle record doesn't exist yet
      const interview = await prisma.interview.findUnique({
        where: { id },
        select: { evidenceBundle: true, legalHold: true },
      });

      if (!interview?.evidenceBundle) {
        return NextResponse.json(
          { error: "Evidence bundle not yet compiled" },
          { status: 404 }
        );
      }

      return NextResponse.json({
        source: "legacy",
        bundle: interview.evidenceBundle,
        legalHold: interview.legalHold,
      });
    }

    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "json";

    if (format === "json") {
      // Update export metadata
      await prisma.evidenceBundle.update({
        where: { id: bundle.id },
        data: { exportedAt: new Date(), exportFormat: "json" },
      });

      return NextResponse.json({
        source: "evidence_bundle",
        id: bundle.id,
        version: bundle.version,
        compiledAt: bundle.compiledAt,
        integrityHash: bundle.integrityHash,
        legalHold: bundle.legalHold,
        artifacts: bundle.artifactManifest,
        scores: bundle.scores,
        evidence: bundle.evidenceItems,
        versioning: bundle.versioning,
        consent: bundle.consent,
      });
    }

    // PDF export placeholder
    return NextResponse.json(
      { error: "PDF export not yet implemented" },
      { status: 501 }
    );
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

// POST — Trigger (re)compilation
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await requireInterviewAccess(id);

    const { compileEvidenceBundle } = await import(
      "@/lib/evidence-bundle-compiler"
    );
    await compileEvidenceBundle(id);

    return NextResponse.json({ success: true, interviewId: id });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
