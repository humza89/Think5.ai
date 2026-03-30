/**
 * Feature Flags — Phased rollout control for enterprise remediation
 *
 * Each phase can be independently enabled/disabled via environment variables.
 * Defaults keep old behavior until explicitly flipped in production.
 */

export const FeatureFlags = {
  /** Phase 1: Use canonical conversation ledger for transcript persistence */
  USE_CANONICAL_LEDGER: envBool("FF_USE_CANONICAL_LEDGER", true),

  /** Phase 2: Deterministic resume with version reconciliation */
  DETERMINISTIC_RESUME: envBool("FF_DETERMINISTIC_RESUME", true),

  /** Phase 3: Stateful interviewer with persisted state machine */
  STATEFUL_INTERVIEWER: envBool("FF_STATEFUL_INTERVIEWER", true),

  /** Phase 4: Tier 1/2 memory extraction and grounding */
  MEMORY_TIERS: envBool("FF_MEMORY_TIERS", false),

  /** Phase 5: Fail-closed production mode (no in-memory fallback) */
  FAIL_CLOSED_PRODUCTION: envBool("FF_FAIL_CLOSED_PRODUCTION", true),

  /** Phase 6: Anti-hallucination grounding gate */
  GROUNDING_GATE_ENABLED: envBool("FF_GROUNDING_GATE", false),

  /** Phase 7: Replay-grade observability timeline */
  TIMELINE_OBSERVABILITY: envBool("FF_TIMELINE_OBSERVABILITY", true),
} as const;

/**
 * Read a boolean feature flag from environment variables.
 * Returns the default value if the env var is not set.
 */
function envBool(key: string, defaultValue: boolean): boolean {
  const val = process.env[key];
  if (val === undefined || val === "") return defaultValue;
  return val === "true" || val === "1";
}

/**
 * Check if a feature flag is enabled. Convenience wrapper.
 */
export function isEnabled(flag: keyof typeof FeatureFlags): boolean {
  return FeatureFlags[flag];
}
