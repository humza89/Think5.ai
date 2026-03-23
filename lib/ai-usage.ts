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
