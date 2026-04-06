/**
 * Unified ATS Gateway — routes to the correct provider based on configuration.
 *
 * Supported providers: greenhouse, lever, workday, ashby
 */

import { logger } from "@/lib/logger";

export type ATSProvider = "greenhouse" | "lever" | "workday" | "ashby";

export interface ATSCandidate {
  id: string;
  name: string;
  email: string;
  phone?: string;
  stage?: string;
  provider: ATSProvider;
}

export interface ATSReportPayload {
  overallScore: number;
  recommendation: string;
  summary: string;
  strengths: string[];
  areasToImprove: string[];
  reportUrl: string;
}

interface ATSIntegrationConfig {
  provider: ATSProvider;
  apiKey: string;
  webhookSecret?: string;
  tenantUrl?: string;
  tenantId?: string;
  onBehalfOf?: string;
}

/**
 * Export interview results to the configured ATS provider.
 */
export async function exportResults(
  config: ATSIntegrationConfig,
  candidateId: string,
  report: ATSReportPayload
): Promise<void> {
  logger.info(`[ats] Exporting results to ${config.provider} for candidate ${candidateId}`);

  switch (config.provider) {
    case "greenhouse": {
      const { exportInterviewResults } = await import("./greenhouse");
      await exportInterviewResults(
        { apiKey: config.apiKey, onBehalfOf: config.onBehalfOf },
        parseInt(candidateId, 10),
        report
      );
      break;
    }
    case "lever": {
      const { exportInterviewResults } = await import("./lever");
      await exportInterviewResults(
        { apiKey: config.apiKey },
        candidateId,
        report
      );
      break;
    }
    case "workday": {
      const { exportInterviewResults } = await import("./workday");
      if (!config.tenantUrl || !config.tenantId) {
        throw new Error("Workday requires tenantUrl and tenantId");
      }
      await exportInterviewResults(
        { accessToken: config.apiKey, tenantUrl: config.tenantUrl, tenantId: config.tenantId },
        candidateId,
        report
      );
      break;
    }
    case "ashby": {
      const { exportInterviewResults } = await import("./ashby");
      await exportInterviewResults(
        { apiKey: config.apiKey },
        candidateId,
        report
      );
      break;
    }
    default:
      throw new Error(`Unsupported ATS provider: ${config.provider}`);
  }
}

/**
 * Verify an ATS webhook signature.
 */
export function verifyWebhook(
  provider: ATSProvider,
  payload: string,
  signature: string,
  secret: string
): boolean {
  switch (provider) {
    case "greenhouse": {
      const { verifyGreenhouseWebhook } = require("./greenhouse");
      return verifyGreenhouseWebhook(payload, signature, secret);
    }
    case "lever": {
      const { verifyLeverWebhook } = require("./lever");
      return verifyLeverWebhook(payload, signature, secret);
    }
    case "ashby": {
      const { verifyAshbyWebhook } = require("./ashby");
      return verifyAshbyWebhook(payload, signature, secret);
    }
    case "workday":
      // Workday does not support webhooks
      logger.warn("[ats] Workday does not support webhook verification");
      return false;
    default:
      return false;
  }
}

/**
 * Map an ATS stage name to a Paraform candidate status.
 */
export function mapStageToParaform(provider: ATSProvider, stage: string): string {
  switch (provider) {
    case "greenhouse": {
      const { mapGreenhouseStage } = require("./greenhouse");
      return mapGreenhouseStage(stage);
    }
    case "lever": {
      const { mapLeverStage } = require("./lever");
      return mapLeverStage(stage);
    }
    case "workday": {
      const { mapWorkdayStage } = require("./workday");
      return mapWorkdayStage(stage);
    }
    case "ashby": {
      const { mapAshbyStage } = require("./ashby");
      return mapAshbyStage(stage);
    }
    default:
      return "SOURCED";
  }
}
