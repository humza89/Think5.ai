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
  MEMORY_TIERS: envBool("FF_MEMORY_TIERS", true),

  /** Phase 5: Fail-closed production mode (no in-memory fallback) */
  FAIL_CLOSED_PRODUCTION: envBool("FF_FAIL_CLOSED_PRODUCTION", true),

  /** Phase 6: Anti-hallucination grounding gate */
  GROUNDING_GATE_ENABLED: envBool("FF_GROUNDING_GATE", true),

  /** Phase 7: Replay-grade observability timeline */
  TIMELINE_OBSERVABILITY: envBool("FF_TIMELINE_OBSERVABILITY", true),

  /** Phase 8: Output gate blocking mode (block + sanitize violations) */
  OUTPUT_GATE_BLOCKING: envBool("FF_OUTPUT_GATE_BLOCKING", true),

  /** Phase 9: Turn-commit protocol (per-turn server verification) */
  TURN_COMMIT_PROTOCOL: envBool("FF_TURN_COMMIT_PROTOCOL", true),

  /** Phase 10: Memory truth service (canonical turn graph + facts) */
  MEMORY_TRUTH_SERVICE: envBool("FF_MEMORY_TRUTH_SERVICE", true),

  /** Phase 11: Semantic contradiction detection (multi-dimensional) */
  SEMANTIC_CONTRADICTION_DETECTOR: envBool("FF_SEMANTIC_CONTRADICTION_DETECTOR", true),

  /** Phase 12: Recruiter memory integrity scorecard */
  MEMORY_INTEGRITY_SCORECARD: envBool("FF_MEMORY_INTEGRITY_SCORECARD", true),
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
