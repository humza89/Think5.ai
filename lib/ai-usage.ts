import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

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

    // Run anomaly detection periodically
    logCounter++;
    if (logCounter % 10 === 0 && input.companyId) {
      detectAnomalousUsage(input.companyId).then((result) => {
        if (result.anomalous) {
          logger.warn(
            `[AI Anomaly] Company ${input.companyId}: $${result.currentDailySpend.toFixed(2)} today vs $${result.avgDailySpend.toFixed(2)} avg (${result.ratio.toFixed(1)}x)`
          );
        }
      }).catch((err) => {
        // M6/R5: Report anomaly detection failures instead of swallowing
        logger.warn("[AI Anomaly] Detection failed: " + String(err));
      });
    }
  } catch (error) {
    // Non-blocking — don't fail operations for usage logging
    logger.error("AI usage logging failed", { error });
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
      logger.warn(
        `[AI Budget Alert] Company ${companyId} has exceeded monthly budget: $${currentSpend.toFixed(2)} / $${threshold} (${utilizationPercent}%)`
      );
    } else if (utilizationPercent >= 80) {
      logger.warn(
        `[AI Budget Warning] Company ${companyId} approaching budget: $${currentSpend.toFixed(2)} / $${threshold} (${utilizationPercent}%)`
      );
    }

    return { overBudget, currentSpend, threshold, utilizationPercent };
  } catch {
    return { overBudget: false, currentSpend: 0, threshold, utilizationPercent: 0 };
  }
}

/**
 * Enforce budget gate before creating a new interview.
 * Returns { allowed: true } or { allowed: false, reason } if over budget.
 * Admin override can be passed to bypass the check.
 */
export async function enforceBudgetGate(
  companyId: string,
  options?: { adminOverride?: boolean }
): Promise<{ allowed: boolean; reason?: string; spend?: number; budget?: number }> {
  if (options?.adminOverride) {
    return { allowed: true };
  }

  try {
    // Get company budget
    const company = await prisma.client.findUnique({
      where: { id: companyId },
      select: { monthlyAiBudgetUsd: true },
    });

    const budget = company?.monthlyAiBudgetUsd;
    if (!budget) {
      // No budget set — allow by default
      return { allowed: true };
    }

    const result = await checkBudgetThreshold(companyId, { budgetUsd: budget });

    if (result.overBudget) {
      return {
        allowed: false,
        reason: `Monthly AI budget exceeded: $${result.currentSpend.toFixed(2)} / $${budget.toFixed(2)} (${result.utilizationPercent}%). Contact admin for override.`,
        spend: result.currentSpend,
        budget,
      };
    }

    // Check rate limit
    const rateCheck = await checkAIRateLimit(companyId);
    if (!rateCheck.allowed) {
      return {
        allowed: false,
        reason: `AI operation rate limit exceeded. ${rateCheck.remaining} of ${rateCheck.limit} operations remaining this hour.`,
        spend: result.currentSpend,
        budget,
      };
    }

    // Check budget alerts (non-blocking)
    checkBudgetAlerts(companyId, result.utilizationPercent, result.currentSpend, budget).catch(() => {});

    return { allowed: true, spend: result.currentSpend, budget };
  } catch {
    // If budget check fails, allow the operation (fail-open)
    return { allowed: true };
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

/**
 * Get per-interview cost summary.
 * Returns total tokens, cost, and model breakdown for a specific interview.
 */
export async function getInterviewCostSummary(interviewId: string): Promise<{
  interviewId: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  modelBreakdown: Array<{
    model: string;
    operation: string;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    modelSelectionReason?: string;
  }>;
}> {
  try {
    const logs = await prisma.aIUsageLog.findMany({
      where: { interviewId },
      orderBy: { createdAt: "asc" },
    });

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCost = 0;

    type UsageLog = (typeof logs)[number];
    const modelBreakdown = logs.map((log: UsageLog) => {
      totalInputTokens += log.inputTokens;
      totalOutputTokens += log.outputTokens;
      totalCost += log.estimatedCost;

      return {
        model: log.model,
        operation: log.operation,
        inputTokens: log.inputTokens,
        outputTokens: log.outputTokens,
        cost: log.estimatedCost,
        modelSelectionReason: (log.metadata as Record<string, string>)?.modelSelectionReason,
      };
    });

    return { interviewId, totalInputTokens, totalOutputTokens, totalCost, modelBreakdown };
  } catch {
    return { interviewId, totalInputTokens: 0, totalOutputTokens: 0, totalCost: 0, modelBreakdown: [] };
  }
}

/**
 * Get cost breakdown by interview type for admin analytics.
 */
export async function getCostByInterviewType(options?: {
  companyId?: string;
  since?: Date;
}): Promise<Array<{
  operation: string;
  interviewCount: number;
  totalCost: number;
  avgCostPerInterview: number;
}>> {
  try {
    const where: Record<string, unknown> = {};
    if (options?.companyId) where.companyId = options.companyId;
    if (options?.since) where.createdAt = { gte: options.since };

    const result = await prisma.aIUsageLog.groupBy({
      by: ["operation"],
      where,
      _sum: { estimatedCost: true },
      _count: { interviewId: true },
    });

    type GroupRow = (typeof result)[number];
    return result.map((row: GroupRow) => ({
      operation: row.operation,
      interviewCount: row._count.interviewId,
      totalCost: row._sum.estimatedCost || 0,
      avgCostPerInterview: row._count.interviewId > 0
        ? (row._sum.estimatedCost || 0) / row._count.interviewId
        : 0,
    }));
  } catch {
    return [];
  }
}

// ── Anomaly Detection ──────────────────────────────────────────────────

let logCounter = 0;

/**
 * Detect anomalous AI usage by comparing today's spend to 7-day average.
 * Flags as anomalous if today exceeds 2x the daily average.
 */
export async function detectAnomalousUsage(companyId: string): Promise<{
  anomalous: boolean;
  currentDailySpend: number;
  avgDailySpend: number;
  ratio: number;
}> {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [todayResult, weekResult] = await Promise.all([
      prisma.aIUsageLog.aggregate({
        where: { companyId, createdAt: { gte: todayStart } },
        _sum: { estimatedCost: true },
      }),
      prisma.aIUsageLog.aggregate({
        where: { companyId, createdAt: { gte: weekAgo, lt: todayStart } },
        _sum: { estimatedCost: true },
      }),
    ]);

    const currentDailySpend = todayResult._sum.estimatedCost || 0;
    const weekTotal = weekResult._sum.estimatedCost || 0;
    const avgDailySpend = weekTotal / 7;
    const ratio = avgDailySpend > 0 ? currentDailySpend / avgDailySpend : 0;

    return {
      anomalous: ratio > 2 && currentDailySpend > 1, // Only flag if >$1 and >2x average
      currentDailySpend,
      avgDailySpend,
      ratio,
    };
  } catch {
    return { anomalous: false, currentDailySpend: 0, avgDailySpend: 0, ratio: 0 };
  }
}

/**
 * Check and send budget alert notifications at threshold crossings.
 * Deduplicates alerts per company/threshold/month using Redis.
 */
export async function checkBudgetAlerts(
  companyId: string,
  utilizationPercent: number,
  currentSpend: number,
  budget: number
): Promise<void> {
  const thresholds = [80, 90, 100];
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM

  for (const threshold of thresholds) {
    if (utilizationPercent >= threshold) {
      try {
        // Dedup via Redis
        let alreadySent = false;
        try {
          const url = process.env.UPSTASH_REDIS_REST_URL;
          const token = process.env.UPSTASH_REDIS_REST_TOKEN;
          if (url && token) {
            const { Redis } = await import("@upstash/redis");
            const redis = new Redis({ url, token });
            const dedupKey = `budget-alert:${companyId}:${threshold}:${month}`;
            const existing = await redis.get(dedupKey);
            if (existing) {
              alreadySent = true;
            } else {
              await redis.set(dedupKey, "1", { ex: 30 * 24 * 3600 }); // 30 day TTL
            }
          }
        } catch {
          // Redis not available — proceed without dedup
        }

        if (!alreadySent) {
          // Send in-app notification to company admins
          try {
            const { createNotification } = await import("@/lib/realtime-notify");
            // Find admin users for this company
            const admins = await prisma.recruiter.findMany({
              where: { companyId, role: "admin" },
              select: { supabaseUserId: true },
            });
            for (const admin of admins) {
              if (admin.supabaseUserId) {
                await createNotification({
                  userId: admin.supabaseUserId,
                  type: "SYSTEM",
                  title: `AI Budget ${threshold >= 100 ? "Exceeded" : "Warning"}`,
                  message: `AI spending has reached ${utilizationPercent}% of monthly budget ($${currentSpend.toFixed(2)} / $${budget.toFixed(2)}).`,
                  data: { companyId, threshold, utilizationPercent },
                });
              }
            }
          } catch {
            // Notification delivery is best-effort
          }

          // Dispatch webhook
          try {
            const { dispatchWebhooks } = await import("@/lib/webhook-dispatch");
            await dispatchWebhooks("ai.budget.warning", companyId, {
              threshold,
              utilizationPercent,
              currentSpend,
              budget,
              month,
            });
          } catch {
            // Webhook dispatch is best-effort
          }
        }
      } catch {
        // Alert delivery failed — non-blocking
      }
    }
  }
}

/**
 * Per-tenant AI operation rate limiting.
 * Default: 100 AI operations per hour per company.
 */
export async function checkAIRateLimit(companyId: string): Promise<{
  allowed: boolean;
  remaining: number;
  limit: number;
}> {
  const limit = 100;
  try {
    const { checkRateLimit } = await import("@/lib/rate-limit");
    const result = await checkRateLimit(`ai-ops:${companyId}`, { maxRequests: limit, windowMs: 3600000 });
    return { allowed: result.allowed, remaining: result.remaining, limit };
  } catch {
    // Fail open
    return { allowed: true, remaining: limit, limit };
  }
}
