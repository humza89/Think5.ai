import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

/**
 * CSP Violation Report Endpoint
 *
 * Receives Content-Security-Policy violation reports from browsers
 * and forwards them to Sentry for monitoring.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const report = body["csp-report"] || body;

    Sentry.captureMessage("CSP Violation", {
      level: "warning",
      extra: {
        blockedUri: report["blocked-uri"],
        documentUri: report["document-uri"],
        violatedDirective: report["violated-directive"],
        effectiveDirective: report["effective-directive"],
        originalPolicy: report["original-policy"],
        sourceFile: report["source-file"],
        lineNumber: report["line-number"],
        columnNumber: report["column-number"],
      },
    });

    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}
