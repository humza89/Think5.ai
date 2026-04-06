/**
 * Workday ATS Integration — Recruiting API v4
 *
 * Supports:
 * - Import candidates from Workday
 * - Export interview results
 * - Update candidate status
 * - OAuth2 Bearer token auth (tenant-specific URLs)
 *
 * Note: Workday does not support webhooks natively.
 * Use EIB (Enterprise Interface Builder) or polling for event sync.
 */

import { logger } from "@/lib/logger";
import * as Sentry from "@sentry/nextjs";

interface WorkdayConfig {
  tenantUrl: string; // e.g., https://wd5-impl-services1.workday.com/ccx
  accessToken: string;
  tenantId: string;
}

interface WorkdayCandidate {
  id: string;
  descriptor: string;
  email: string;
  phone?: string;
  status?: string;
}

// ── API Client ──────────────────────────────────────────────────────────

async function workdayRequest<T>(
  config: WorkdayConfig,
  path: string,
  options?: RequestInit
): Promise<T> {
  const baseUrl = `${config.tenantUrl}/api/recruiting/v4/${config.tenantId}`;

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error(`[workday] API error (${response.status}): ${error}`);
    throw new Error(`Workday API error (${response.status}): ${error}`);
  }

  return response.json() as Promise<T>;
}

// ── Candidate Import ────────────────────────────────────────────────────

export async function importCandidateFromWorkday(
  config: WorkdayConfig,
  candidateId: string
): Promise<WorkdayCandidate> {
  return workdayRequest<WorkdayCandidate>(config, `/candidates/${candidateId}`);
}

export async function listCandidatesForJob(
  config: WorkdayConfig,
  jobId: string,
  limit = 100,
  offset = 0
): Promise<{ data: WorkdayCandidate[]; total: number }> {
  return workdayRequest(config, `/jobs/${jobId}/candidates?limit=${limit}&offset=${offset}`);
}

// ── Result Export ───────────────────────────────────────────────────────

export async function submitCandidateForJob(
  config: WorkdayConfig,
  jobId: string,
  candidate: { name: string; email: string; phone?: string; resumeUrl?: string }
): Promise<{ id: string }> {
  return workdayRequest(config, `/jobs/${jobId}/candidates`, {
    method: "POST",
    body: JSON.stringify({
      name: candidate.name,
      email: candidate.email,
      phone: candidate.phone,
      resume_url: candidate.resumeUrl,
    }),
  });
}

export async function updateCandidateStatus(
  config: WorkdayConfig,
  candidateId: string,
  status: string
): Promise<void> {
  await workdayRequest(config, `/candidates/${candidateId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

// ── Stage Mapping ───────────────────────────────────────────────────────

const WORKDAY_TO_PARAFORM_STATUS: Record<string, string> = {
  "screen": "CONTACTED",
  "assess": "CONTACTED",
  "interview": "INTERVIEWED",
  "offer": "OFFERED",
  "hire": "HIRED",
};

export function mapWorkdayStage(workdayStage: string): string {
  return WORKDAY_TO_PARAFORM_STATUS[workdayStage] || "SOURCED";
}

// ── Export Interview Results ────────────────────────────────────────────

export async function exportInterviewResults(
  config: WorkdayConfig,
  candidateId: string,
  report: {
    overallScore: number;
    recommendation: string;
    summary: string;
    strengths: string[];
    areasToImprove: string[];
    reportUrl: string;
  }
): Promise<void> {
  const note = [
    `Paraform AI Interview Results`,
    `Overall Score: ${report.overallScore}/100`,
    `Recommendation: ${report.recommendation}`,
    `Summary: ${report.summary}`,
    `Strengths: ${report.strengths.join("; ")}`,
    `Areas for Improvement: ${report.areasToImprove.join("; ")}`,
    `Full Report: ${report.reportUrl}`,
  ].join("\n");

  try {
    // Workday uses comments/notes on the candidate record
    await workdayRequest(config, `/candidates/${candidateId}/comments`, {
      method: "POST",
      body: JSON.stringify({ comment: note }),
    });
  } catch (error) {
    Sentry.captureException(error, {
      extra: { candidateId, recommendation: report.recommendation },
    });
    throw error;
  }
}
