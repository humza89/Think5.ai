/**
 * Score normalization using z-score method.
 * Provides fair comparison across different interview types and scoring dimensions.
 * Backed by Redis for persistence across serverless deployments.
 */

import { logger } from "@/lib/logger";

interface NormalizationParams {
  mean: number;
  stddev: number;
  count: number;
}

// In-memory fallback store
const paramsStore = new Map<string, NormalizationParams>();

// Defaults when no historical data exists
const DEFAULT_MEAN = 65;
const DEFAULT_STDDEV = 15;

// Lazy Redis client
let _redis: any = null;
async function getRedis() {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const { Redis } = await import("@upstash/redis");
    _redis = new Redis({ url, token });
    return _redis;
  } catch {
    return null;
  }
}

function redisKey(interviewType: string, dimensionName: string): string {
  return `score-norm:${interviewType}:${dimensionName}`;
}

function storeKey(interviewType: string, dimensionName: string): string {
  return `${interviewType}:${dimensionName}`;
}

async function getParams(interviewType: string, dimensionName: string): Promise<NormalizationParams> {
  // Try Redis first
  const redis = await getRedis();
  if (redis) {
    try {
      const data = await redis.get(redisKey(interviewType, dimensionName));
      if (data) {
        const parsed = typeof data === "string" ? JSON.parse(data) : data;
        // Sync to in-memory
        paramsStore.set(storeKey(interviewType, dimensionName), parsed);
        return parsed;
      }
    } catch (err) {
      logger.debug("[score-normalizer] Redis read failed, using in-memory fallback", err as Record<string, unknown>);
    }
  }

  // Fall back to in-memory
  return paramsStore.get(storeKey(interviewType, dimensionName)) || {
    mean: DEFAULT_MEAN,
    stddev: DEFAULT_STDDEV,
    count: 0,
  };
}

async function setParams(interviewType: string, dimensionName: string, params: NormalizationParams): Promise<void> {
  // Update in-memory
  paramsStore.set(storeKey(interviewType, dimensionName), params);

  // Persist to Redis
  const redis = await getRedis();
  if (redis) {
    try {
      await redis.set(redisKey(interviewType, dimensionName), JSON.stringify(params));
    } catch (err) {
      logger.debug("[score-normalizer] Redis write failed", err as Record<string, unknown>);
    }
  }
}

/**
 * Normalize a raw score using z-score normalization.
 * Formula: normalizedScore = 50 + 10 * ((rawScore - mean) / stddev)
 * Result is clamped to [0, 100].
 */
export async function normalizeScore(
  rawScore: number,
  interviewType: string,
  dimensionName: string
): Promise<number> {
  const params = await getParams(interviewType, dimensionName);
  const { mean, stddev } = params;

  const effectiveStddev = stddev > 0 ? stddev : DEFAULT_STDDEV;
  const normalized = 50 + 10 * ((rawScore - mean) / effectiveStddev);

  return Math.max(0, Math.min(100, Math.round(normalized * 100) / 100));
}

/**
 * Update the running mean and standard deviation for a dimension.
 * Uses Welford's online algorithm for numerically stable incremental updates.
 */
export async function updateNormalizationParams(
  interviewType: string,
  dimensionName: string,
  newScore: number
): Promise<void> {
  const existing = await getParams(interviewType, dimensionName);

  if (existing.count === 0) {
    await setParams(interviewType, dimensionName, {
      mean: newScore,
      stddev: DEFAULT_STDDEV,
      count: 1,
    });
    return;
  }

  const { mean, stddev, count } = existing;
  const newCount = count + 1;

  // Welford's online algorithm
  const delta = newScore - mean;
  const newMean = mean + delta / newCount;
  const delta2 = newScore - newMean;

  const oldM2 = stddev * stddev * count;
  const newM2 = oldM2 + delta * delta2;

  const calculatedStddev = newCount >= 5
    ? Math.sqrt(newM2 / newCount)
    : DEFAULT_STDDEV;

  await setParams(interviewType, dimensionName, {
    mean: newMean,
    stddev: calculatedStddev > 0 ? calculatedStddev : DEFAULT_STDDEV,
    count: newCount,
  });
}

/**
 * Retrieve current normalization parameters for observability/debugging.
 */
export async function getNormalizationParams(
  interviewType: string,
  dimensionName: string
): Promise<NormalizationParams> {
  return getParams(interviewType, dimensionName);
}
