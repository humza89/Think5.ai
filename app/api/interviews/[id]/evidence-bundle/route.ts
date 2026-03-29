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

    if (format === "pdf" || format === "html") {
      await prisma.evidenceBundle.update({
        where: { id: bundle.id },
        data: { exportedAt: new Date(), exportFormat: "pdf" },
      });

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Evidence Bundle - ${id}</title>
          <style>
            body { font-family: system-ui, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 2rem; }
            h1 { border-bottom: 2px solid #eee; padding-bottom: 0.5rem; }
            .section { margin-bottom: 2rem; }
            .meta { background: #f9f9f9; padding: 1rem; border-radius: 4px; border-left: 4px solid #4f46e5; }
            pre { background: #111; color: #eee; padding: 1rem; border-radius: 4px; overflow-x: auto; font-size: 0.85rem; }
          </style>
        </head>
        <body onload="window.print()">
          <h1>Interview Evidence Bundle</h1>
          <div class="meta">
            <p><strong>Interview ID:</strong> ${id}</p>
            <p><strong>Compiled At:</strong> ${bundle.compiledAt.toISOString()}</p>
            <p><strong>Integrity Hash:</strong> ${bundle.integrityHash}</p>
          </div>
          
          <div class="section">
            <h2>Evaluation Scores</h2>
            <pre>${JSON.stringify(bundle.scores, null, 2)}</pre>
          </div>

          <div class="section">
            <h2>Evidence Items</h2>
            <pre>${JSON.stringify(bundle.evidenceItems, null, 2)}</pre>
          </div>
        </body>
        </html>
      `;

      return new NextResponse(htmlContent, {
        headers: {
          "Content-Type": "text/html",
          "Content-Disposition": `inline; filename="evidence-${id}.html"`
        }
      });
    }

    return NextResponse.json({ error: "Unsupported format" }, { status: 400 });
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
