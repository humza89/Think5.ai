import { createHash } from "crypto";

/**
 * Compute a SHA-256 hash of the evidence bundle (transcript + report scores + recording URL).
 * Used for tamper-evident sealing of interview evidence.
 */
export function computeEvidenceHash(
  transcript: unknown,
  reportData: {
    overallScore?: number | null;
    recommendation?: string | null;
    summary?: string | null;
    domainExpertise?: number | null;
    problemSolving?: number | null;
    communicationScore?: number | null;
    integrityScore?: number | null;
  },
  recordingUrl?: string | null
): string {
  const payload = JSON.stringify({
    transcript,
    report: {
      overallScore: reportData.overallScore,
      recommendation: reportData.recommendation,
      summary: reportData.summary,
      domainExpertise: reportData.domainExpertise,
      problemSolving: reportData.problemSolving,
      communicationScore: reportData.communicationScore,
      integrityScore: reportData.integrityScore,
    },
    recordingUrl: recordingUrl || null,
  });

  return createHash("sha256").update(payload).digest("hex");
}
