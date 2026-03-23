import { prisma } from "@/lib/prisma";

type AIOperation =
  | "plan_generation"
  | "report_generation"
  | "live_interview"
  | "text_interview"
  | "scoring";

interface UsageLogInput {
  interviewId?: string;
  operation: AIOperation;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
  companyId?: string;
  recruiterId?: string;
  metadata?: Record<string, unknown>;
}

// Approximate cost per 1K tokens (USD) — Gemini pricing as of 2026
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "gemini-1.5-pro": { input: 0.00125, output: 0.005 },
  "gemini-2.0-flash": { input: 0.0001, output: 0.0004 },
  "gemini-2.0-flash-live": { input: 0.0002, output: 0.0008 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const costs = MODEL_COSTS[model] || MODEL_COSTS["gemini-1.5-pro"];
  return (inputTokens / 1000) * costs.input + (outputTokens / 1000) * costs.output;
}

/**
 * Log AI model usage for cost tracking and analytics.
 * Fire-and-forget — never throws.
 */
export async function logAIUsage(input: UsageLogInput): Promise<void> {
  try {
    const estimatedCost = estimateCost(
      input.model,
      input.inputTokens || 0,
      input.outputTokens || 0
    );

    await prisma.aIUsageLog.create({
      data: {
        interviewId: input.interviewId || null,
        operation: input.operation,
        model: input.model,
        inputTokens: input.inputTokens || 0,
        outputTokens: input.outputTokens || 0,
        durationMs: input.durationMs || 0,
        estimatedCost,
        companyId: input.companyId || null,
        recruiterId: input.recruiterId || null,
        metadata: input.metadata || null,
      },
    });
  } catch (error) {
    // Non-blocking — don't fail operations for usage logging
    console.error("AI usage logging failed:", error);
  }
}

// Default monthly budget threshold per company (USD)
const DEFAULT_MONTHLY_BUDGET_USD = 500;

/**
 * Check if a company's AI spending has exceeded budget threshold.
 * Returns spending status for governance visibility.
 */
export async function checkBudgetThreshold(companyId: string, options?: {
  budgetUsd?: number;
}): Promise<{
  overBudget: boolean;
  currentSpend: number;
  threshold: number;
  utilizationPercent: number;
}> {
  const threshold = options?.budgetUsd || DEFAULT_MONTHLY_BUDGET_USD;

  // Current month window
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  try {
    const result = await prisma.aIUsageLog.aggregate({
      where: {
        companyId,
        createdAt: { gte: monthStart },
      },
      _sum: { estimatedCost: true },
    });

    const currentSpend = result._sum.estimatedCost || 0;
    const overBudget = currentSpend > threshold;
    const utilizationPercent = threshold > 0 ? Math.round((currentSpend / threshold) * 100) : 0;

    if (overBudget) {
      console.warn(
        `[AI Budget Alert] Company ${companyId} has exceeded monthly budget: $${currentSpend.toFixed(2)} / $${threshold} (${utilizationPercent}%)`
      );
    } else if (utilizationPercent >= 80) {
      console.warn(
        `[AI Budget Warning] Company ${companyId} approaching budget: $${currentSpend.toFixed(2)} / $${threshold} (${utilizationPercent}%)`
      );
    }

    return { overBudget, currentSpend, threshold, utilizationPercent };
  } catch {
    return { overBudget: false, currentSpend: 0, threshold, utilizationPercent: 0 };
  }
}

/**
 * Get aggregated AI usage stats for a given time period.
 */
export async function getUsageStats(options?: {
  companyId?: string;
  since?: Date;
  until?: Date;
}) {
  const where: Record<string, unknown> = {};
  if (options?.companyId) where.companyId = options.companyId;
  if (options?.since || options?.until) {
    where.createdAt = {
      ...(options.since ? { gte: options.since } : {}),
      ...(options.until ? { lte: options.until } : {}),
    };
  }

  const logs = await prisma.aIUsageLog.groupBy({
    by: ["operation", "model"],
    where,
    _sum: {
      inputTokens: true,
      outputTokens: true,
      durationMs: true,
      estimatedCost: true,
    },
    _count: true,
  });

  type UsageRow = (typeof logs)[number];

  const totalCost = logs.reduce(
    (sum: number, log: UsageRow) => sum + (log._sum.estimatedCost || 0),
    0
  );

  return {
    breakdown: logs.map((log: UsageRow) => ({
      operation: log.operation,
      model: log.model,
      count: log._count,
      totalInputTokens: log._sum.inputTokens || 0,
      totalOutputTokens: log._sum.outputTokens || 0,
      totalDurationMs: log._sum.durationMs || 0,
      totalCost: log._sum.estimatedCost || 0,
    })),
    totalCost,
  };
}
