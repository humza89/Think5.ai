/**
 * Greenhouse ATS Integration — Harvest API v4
 *
 * Supports:
 * - Import candidates from Greenhouse
 * - Export interview results to Greenhouse
 * - Webhook handler for candidate stage changes
 * - Map Greenhouse stages to Paraform interview status
 */

import { createHmac } from "crypto";
import * as Sentry from "@sentry/nextjs";

interface GreenhouseConfig {
  apiKey: string;
  webhookSecret?: string;
  onBehalfOf?: string;
}

interface GreenhouseCandidate {
  id: number;
  first_name: string;
  last_name: string;
  emails: Array<{ value: string; type: string }>;
  phone_numbers: Array<{ value: string; type: string }>;
  applications: Array<{
    id: number;
    job: { id: number; name: string };
    current_stage: { name: string };
    status: string;
  }>;
  recruiter?: { id: number; name: string };
}

interface GreenhouseApplication {
  id: number;
  candidate_id: number;
  job: { id: number; name: string };
  current_stage: { name: string };
  status: string;
}

const GREENHOUSE_API_BASE = "https://harvest.greenhouse.io/v1";

// ── API Client ──────────────────────────────────────────────────────────

async function greenhouseRequest<T>(
  config: GreenhouseConfig,
  path: string,
  options?: RequestInit
): Promise<T> {
  const auth = Buffer.from(`${config.apiKey}:`).toString("base64");

  const headers: Record<string, string> = {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
  };

  if (config.onBehalfOf) {
    headers["On-Behalf-Of"] = config.onBehalfOf;
  }

  const response = await fetch(`${GREENHOUSE_API_BASE}${path}`, {
    ...options,
    headers: { ...headers, ...options?.headers },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Greenhouse API error (${response.status}): ${error}`);
  }

  return response.json() as Promise<T>;
}

// ── Candidate Import ────────────────────────────────────────────────────

export async function importCandidateFromGreenhouse(
  config: GreenhouseConfig,
  candidateId: number
): Promise<GreenhouseCandidate> {
  return greenhouseRequest<GreenhouseCandidate>(config, `/candidates/${candidateId}`);
}

export async function listCandidatesForJob(
  config: GreenhouseConfig,
  jobId: number,
  page = 1,
  perPage = 100
): Promise<GreenhouseCandidate[]> {
  return greenhouseRequest<GreenhouseCandidate[]>(
    config,
    `/candidates?job_id=${jobId}&page=${page}&per_page=${perPage}`
  );
}

// ── Result Export ───────────────────────────────────────────────────────

export async function addNoteToCandidate(
  config: GreenhouseConfig,
  candidateId: number,
  note: string,
  visibility: "public" | "private" = "private"
): Promise<void> {
  await greenhouseRequest(config, `/candidates/${candidateId}/activity_feed/notes`, {
    method: "POST",
    body: JSON.stringify({
      user_id: config.onBehalfOf,
      body: note,
      visibility,
    }),
  });
}

export async function advanceCandidateStage(
  config: GreenhouseConfig,
  applicationId: number
): Promise<void> {
  await greenhouseRequest(config, `/applications/${applicationId}/advance`, {
    method: "POST",
  });
}

export async function rejectApplication(
  config: GreenhouseConfig,
  applicationId: number,
  rejectionReasonId?: number,
  notes?: string
): Promise<void> {
  await greenhouseRequest(config, `/applications/${applicationId}/reject`, {
    method: "POST",
    body: JSON.stringify({
      rejection_reason_id: rejectionReasonId,
      notes,
    }),
  });
}

// ── Webhook Verification ────────────────────────────────────────────────

export function verifyGreenhouseWebhook(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  return signature === expectedSignature;
}

// ── Stage Mapping ───────────────────────────────────────────────────────

const GREENHOUSE_TO_PARAFORM_STATUS: Record<string, string> = {
  "Application Review": "SOURCED",
  "Phone Screen": "CONTACTED",
  "Technical Interview": "INTERVIEWED",
  "On-site Interview": "INTERVIEWED",
  "Offer": "OFFERED",
  "Hired": "HIRED",
  "Rejected": "REJECTED",
};

export function mapGreenhouseStage(greenhouseStage: string): string {
  return GREENHOUSE_TO_PARAFORM_STATUS[greenhouseStage] || "SOURCED";
}

// ── Export Interview Results ────────────────────────────────────────────

export async function exportInterviewResults(
  config: GreenhouseConfig,
  candidateId: number,
  report: {
    overallScore: number;
    recommendation: string;
    summary: string;
    strengths: string[];
    areasToImprove: string[];
    reportUrl: string;
  }
): Promise<void> {
  const scoreEmoji =
    report.recommendation === "STRONG_YES" ? "+++" :
    report.recommendation === "YES" ? "++" :
    report.recommendation === "MAYBE" ? "+" :
    report.recommendation === "NO" ? "-" : "--";

  const note = [
    `## Paraform AI Interview Results [${scoreEmoji}]`,
    "",
    `**Overall Score:** ${report.overallScore}/100`,
    `**Recommendation:** ${report.recommendation}`,
    "",
    `**Summary:** ${report.summary}`,
    "",
    `**Strengths:**`,
    ...report.strengths.map((s) => `- ${s}`),
    "",
    `**Areas for Improvement:**`,
    ...report.areasToImprove.map((a) => `- ${a}`),
    "",
    `[View Full Report](${report.reportUrl})`,
  ].join("\n");

  try {
    await addNoteToCandidate(config, candidateId, note, "private");
  } catch (error) {
    Sentry.captureException(error, {
      extra: { candidateId, recommendation: report.recommendation },
    });
    throw error;
  }
}
