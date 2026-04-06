/**
 * Lever ATS Integration — API v1
 *
 * Supports:
 * - Import candidates from Lever
 * - Export interview results as notes
 * - Advance opportunity stages
 * - HMAC-SHA256 webhook verification via X-Lever-Signature
 */

import { createHmac } from "crypto";
import { logger } from "@/lib/logger";
import * as Sentry from "@sentry/nextjs";

interface LeverConfig {
  apiKey: string;
  webhookSecret?: string;
}

interface LeverContact {
  name: string;
  headline?: string;
  emails: Array<{ value: string }>;
  phones: Array<{ value: string }>;
  location?: string;
  links: string[];
}

interface LeverOpportunity {
  id: string;
  name: string;
  headline?: string;
  contact: string;
  emails: string[];
  phones: Array<{ value: string }>;
  links: string[];
  stage?: string;
  stageChanges: Array<{ toStageId: string; updatedAt: number }>;
  archived?: { reason: string; archivedAt: number };
  createdAt: number;
  updatedAt: number;
}

const LEVER_API_BASE = "https://api.lever.co/v1";

// ── API Client ──────────────────────────────────────────────────────────

async function leverRequest<T>(
  config: LeverConfig,
  path: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${LEVER_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error(`[lever] API error (${response.status}): ${error}`);
    throw new Error(`Lever API error (${response.status}): ${error}`);
  }

  const json = await response.json();
  return json.data ?? json;
}

// ── Candidate Import ────────────────────────────────────────────────────

export async function importCandidateFromLever(
  config: LeverConfig,
  opportunityId: string
): Promise<LeverOpportunity> {
  return leverRequest<LeverOpportunity>(config, `/opportunities/${opportunityId}`);
}

export async function listOpportunitiesForPosting(
  config: LeverConfig,
  postingId: string,
  limit = 100
): Promise<LeverOpportunity[]> {
  return leverRequest<LeverOpportunity[]>(
    config,
    `/opportunities?posting_id=${postingId}&limit=${limit}`
  );
}

// ── Result Export ───────────────────────────────────────────────────────

export async function addNoteToOpportunity(
  config: LeverConfig,
  opportunityId: string,
  note: string
): Promise<void> {
  await leverRequest(config, `/opportunities/${opportunityId}/notes`, {
    method: "POST",
    body: JSON.stringify({ value: note }),
  });
}

export async function advanceOpportunityStage(
  config: LeverConfig,
  opportunityId: string,
  stageId: string
): Promise<void> {
  await leverRequest(config, `/opportunities/${opportunityId}/stage`, {
    method: "PUT",
    body: JSON.stringify({ stage: stageId }),
  });
}

// ── Webhook Verification ────────────────────────────────────────────────

export function verifyLeverWebhook(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expected = createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  return signature === expected;
}

// ── Stage Mapping ───────────────────────────────────────────────────────

const LEVER_TO_PARAFORM_STATUS: Record<string, string> = {
  "new-lead": "SOURCED",
  "new-applicant": "SOURCED",
  "phone-screen": "CONTACTED",
  "on-site": "INTERVIEWED",
  "offer": "OFFERED",
  "hired": "HIRED",
};

export function mapLeverStage(leverStage: string): string {
  return LEVER_TO_PARAFORM_STATUS[leverStage] || "SOURCED";
}

// ── Export Interview Results ────────────────────────────────────────────

export async function exportInterviewResults(
  config: LeverConfig,
  opportunityId: string,
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
    await addNoteToOpportunity(config, opportunityId, note);
  } catch (error) {
    Sentry.captureException(error, {
      extra: { opportunityId, recommendation: report.recommendation },
    });
    throw error;
  }
}
