/**
 * Ashby ATS Integration — API v1
 *
 * Supports:
 * - Import candidates from Ashby
 * - Create and update candidates
 * - Export interview results
 * - HMAC-SHA256 webhook verification via X-Ashby-Signature
 *
 * Auth: Basic auth (apiKey:empty)
 */

import { createHmac } from "crypto";
import { logger } from "@/lib/logger";
import * as Sentry from "@sentry/nextjs";

interface AshbyConfig {
  apiKey: string;
  webhookSecret?: string;
}

interface AshbyCandidate {
  id: string;
  name: string;
  primaryEmailAddress?: { value: string };
  phoneNumbers: Array<{ value: string }>;
  socialLinks: Array<{ url: string; type: string }>;
  fileHandles: Array<{ handle: string; name: string }>;
  createdAt: string;
}

const ASHBY_API_BASE = "https://api.ashbyhq.com";

// ── API Client ──────────────────────────────────────────────────────────

async function ashbyRequest<T>(
  config: AshbyConfig,
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const auth = Buffer.from(`${config.apiKey}:`).toString("base64");

  const response = await fetch(`${ASHBY_API_BASE}${path}`, {
    method: "POST", // Ashby API uses POST for all endpoints
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error(`[ashby] API error (${response.status}): ${error}`);
    throw new Error(`Ashby API error (${response.status}): ${error}`);
  }

  const json = await response.json();
  return json.results ?? json;
}

// ── Candidate Import ────────────────────────────────────────────────────

export async function importCandidateFromAshby(
  config: AshbyConfig,
  candidateId: string
): Promise<AshbyCandidate> {
  return ashbyRequest<AshbyCandidate>(config, "/candidate.info", {
    candidateId,
  });
}

export async function createCandidate(
  config: AshbyConfig,
  candidate: { name: string; email: string; phone?: string; linkedinUrl?: string }
): Promise<AshbyCandidate> {
  return ashbyRequest<AshbyCandidate>(config, "/candidate.create", {
    name: candidate.name,
    email: candidate.email,
    phoneNumber: candidate.phone,
    socialLinks: candidate.linkedinUrl
      ? [{ url: candidate.linkedinUrl, type: "LinkedIn" }]
      : undefined,
  });
}

export async function updateCandidate(
  config: AshbyConfig,
  candidateId: string,
  updates: { name?: string; email?: string; phone?: string }
): Promise<void> {
  await ashbyRequest(config, "/candidate.update", {
    candidateId,
    ...updates,
  });
}

// ── Interview Schedules ─────────────────────────────────────────────────

export async function listInterviewSchedules(
  config: AshbyConfig,
  candidateId: string
): Promise<Array<{ id: string; status: string; interviewStage: string }>> {
  return ashbyRequest(config, "/interviewSchedule.list", { candidateId });
}

// ── Webhook Verification ────────────────────────────────────────────────

export function verifyAshbyWebhook(
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

const ASHBY_TO_PARAFORM_STATUS: Record<string, string> = {
  "new": "SOURCED",
  "phone_screen": "CONTACTED",
  "on_site": "INTERVIEWED",
  "debrief": "INTERVIEWED",
  "offer": "OFFERED",
  "hired": "HIRED",
};

export function mapAshbyStage(ashbyStage: string): string {
  return ASHBY_TO_PARAFORM_STATUS[ashbyStage] || "SOURCED";
}

// ── Export Interview Results ────────────────────────────────────────────

export async function exportInterviewResults(
  config: AshbyConfig,
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
    await ashbyRequest(config, "/candidate.addNote", {
      candidateId,
      note,
    });
  } catch (error) {
    Sentry.captureException(error, {
      extra: { candidateId, recommendation: report.recommendation },
    });
    throw error;
  }
}
