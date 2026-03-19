/**
 * Interview Audit Logging
 *
 * Convenience wrapper around logActivity() specifically for interview-sensitive actions.
 * All interview lifecycle events should be logged through this module.
 */

import { logActivity } from "@/lib/activity-log";

export interface InterviewAuditParams {
  interviewId: string;
  action: string;
  userId: string;
  userRole: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

/**
 * Log an interview-related audit event.
 *
 * Standard actions:
 * - interview.validated, interview.stream_started, interview.stream_ended
 * - interview.voice_started, interview.voice_ended
 * - recording.chunk_uploaded, recording.finalized
 * - report.generated, report.viewed, report.reviewed
 * - report.shared, report.share_revoked
 * - retention.recording_deleted, retention.transcript_cleared
 */
export async function logInterviewActivity(params: InterviewAuditParams): Promise<void> {
  return logActivity({
    userId: params.userId,
    userRole: params.userRole,
    action: params.action,
    entityType: "Interview",
    entityId: params.interviewId,
    metadata: params.metadata,
    ipAddress: params.ipAddress,
  });
}

/**
 * Extract client IP from request headers (works behind reverse proxy).
 */
export function getClientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers.get("x-real-ip") ??
    "unknown"
  );
}
