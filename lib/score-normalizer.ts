/**
 * Score normalization using z-score method.
 * Provides fair comparison across different interview types and scoring dimensions.
 */

interface NormalizationParams {
  mean: number;
  stddev: number;
  count: number;
}

// In-memory store keyed by "interviewType:dimensionName"
const paramsStore = new Map<string, NormalizationParams>();

// Defaults when no historical data exists
const DEFAULT_MEAN = 65;
const DEFAULT_STDDEV = 15;

function storeKey(interviewType: string, dimensionName: string): string {
  return `${interviewType}:${dimensionName}`;
}

/**
 * Normalize a raw score using z-score normalization.
 *
 * Formula: normalizedScore = 50 + 10 * ((rawScore - mean) / stddev)
 * Result is clamped to [0, 100].
 */
export function normalizeScore(
  rawScore: number,
  interviewType: string,
  dimensionName: string
): number {
  const key = storeKey(interviewType, dimensionName);
  const params = paramsStore.get(key) || {
    mean: DEFAULT_MEAN,
    stddev: DEFAULT_STDDEV,
    count: 0,
  };

  const { mean, stddev } = params;

  // Guard against zero stddev (would cause division by zero)
  const effectiveStddev = stddev > 0 ? stddev : DEFAULT_STDDEV;

  const normalized = 50 + 10 * ((rawScore - mean) / effectiveStddev);

  // Clamp to 0-100
  return Math.max(0, Math.min(100, Math.round(normalized * 100) / 100));
}

/**
 * Update the running mean and standard deviation for a dimension.
 * Uses Welford's online algorithm for numerically stable incremental updates.
 */
export function updateNormalizationParams(
  interviewType: string,
  dimensionName: string,
  newScore: number
): void {
  const key = storeKey(interviewType, dimensionName);
  const existing = paramsStore.get(key);

  if (!existing || existing.count === 0) {
    // First data point
    paramsStore.set(key, {
      mean: newScore,
      stddev: DEFAULT_STDDEV, // Keep default stddev until we have enough data
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

  // Running sum of squared deviations (M2)
  // Reconstruct M2 from existing stddev and count
  const oldM2 = stddev * stddev * count;
  const newM2 = oldM2 + delta * delta2;

  // Population standard deviation (use at least DEFAULT_STDDEV until sufficient data)
  const calculatedStddev = newCount >= 5
    ? Math.sqrt(newM2 / newCount)
    : DEFAULT_STDDEV;

  paramsStore.set(key, {
    mean: newMean,
    stddev: calculatedStddev > 0 ? calculatedStddev : DEFAULT_STDDEV,
    count: newCount,
  });
}

/**
 * Retrieve current normalization parameters for observability/debugging.
 */
export function getNormalizationParams(
  interviewType: string,
  dimensionName: string
): NormalizationParams {
  const key = storeKey(interviewType, dimensionName);
  return paramsStore.get(key) || {
    mean: DEFAULT_MEAN,
    stddev: DEFAULT_STDDEV,
    count: 0,
  };
}
