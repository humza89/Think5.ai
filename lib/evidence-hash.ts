import { createHash, createHmac } from "crypto";

interface EvidenceReportData {
  overallScore?: number | null;
  recommendation?: string | null;
  summary?: string | null;
  technicalSkills?: unknown;
  softSkills?: unknown;
  domainExpertise?: number | null;
  problemSolving?: number | null;
  communicationScore?: number | null;
  integrityScore?: number | null;
  riskSignals?: unknown;
  hypothesisOutcomes?: unknown;
  jobMatchScore?: number | null;
  evidenceHighlights?: unknown;
}

export interface EvidenceHashPayload {
  interviewId: string;
  transcript: unknown;
  report: {
    overallScore: number | null | undefined;
    recommendation: string | null | undefined;
    summary: string | null | undefined;
    technicalSkills: unknown;
    softSkills: unknown;
    domainExpertise: number | null | undefined;
    problemSolving: number | null | undefined;
    communicationScore: number | null | undefined;
    integrityScore: number | null | undefined;
    riskSignals: unknown;
    hypothesisOutcomes: unknown;
    jobMatchScore: number | null | undefined;
    evidenceHighlights: unknown;
  };
  recordingUrl: string | null;
}

/**
 * Build the canonical payload for evidence hashing/signing.
 * The payload is deterministic (no timestamp) so re-hashing produces the same result.
 */
function buildHashablePayload(
  interviewId: string,
  transcript: unknown,
  reportData: EvidenceReportData,
  recordingUrl?: string | null
): EvidenceHashPayload {
  return {
    interviewId,
    transcript,
    report: {
      overallScore: reportData.overallScore,
      recommendation: reportData.recommendation,
      summary: reportData.summary,
      technicalSkills: reportData.technicalSkills,
      softSkills: reportData.softSkills,
      domainExpertise: reportData.domainExpertise,
      problemSolving: reportData.problemSolving,
      communicationScore: reportData.communicationScore,
      integrityScore: reportData.integrityScore,
      riskSignals: reportData.riskSignals,
      hypothesisOutcomes: reportData.hypothesisOutcomes,
      jobMatchScore: reportData.jobMatchScore,
      evidenceHighlights: reportData.evidenceHighlights,
    },
    recordingUrl: recordingUrl || null,
  };
}

/**
 * Sign a serialized string with HMAC-SHA256 (or plain SHA-256 fallback in dev).
 */
function signString(data: string): string {
  const signingKey = process.env.EVIDENCE_SIGNING_KEY;

  if (signingKey) {
    return createHmac("sha256", signingKey).update(data).digest("hex");
  }
  // Dev fallback: plain SHA-256
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Compute an HMAC-SHA256 signature (or plain SHA-256 fallback) of the evidence bundle.
 * Includes all report fields and interviewId for tamper-evident sealing.
 *
 * Returns `{ signature, payload, signedAt }` so metadata can be stored alongside.
 */
export function computeEvidenceHash(
  transcript: unknown,
  reportData: EvidenceReportData,
  recordingUrl?: string | null,
  interviewId?: string
): { signature: string; payload: EvidenceHashPayload; signedAt: string } {
  const payload = buildHashablePayload(
    interviewId || "unknown",
    transcript,
    reportData,
    recordingUrl
  );
  const serialized = JSON.stringify(payload);
  const signature = signString(serialized);

  return { signature, payload, signedAt: new Date().toISOString() };
}

/**
 * Verify an evidence signature against its payload.
 * Re-serializes the payload and checks HMAC (or plain hash in dev).
 * Uses constant-time comparison to prevent timing attacks.
 */
export function verifyEvidenceSignature(
  payload: EvidenceHashPayload,
  signature: string
): boolean {
  const serialized = JSON.stringify(payload);
  const expected = signString(serialized);

  // Constant-time comparison to prevent timing attacks
  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}
