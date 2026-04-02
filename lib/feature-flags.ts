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

  /** Phase 13: Voice mode global kill switch */
  VOICE_MODE_ENABLED: envBool("FF_VOICE_MODE_ENABLED", true),

  // ── Round 12: Enterprise Audit N1-N13 ──────────────────────────────

  /** N1: Server-authoritative turn delivery (client hold-and-validate) */
  SERVER_AUTHORITATIVE_TURNS: envBool("FF_SERVER_AUTHORITATIVE_TURNS", true),

  /** N2: Atomic turn boundary (Prisma $transaction wrapping all writes) */
  ATOMIC_TURN_COMMIT: envBool("FF_ATOMIC_TURN_COMMIT", true),

  /** N3: Enterprise memory hard pause at 0.65 confidence threshold */
  ENTERPRISE_MEMORY_HARD_PAUSE: envBool("FF_ENTERPRISE_MEMORY_HARD_PAUSE", true),

  /** N9: Strict monotonic sequence number enforcement */
  STRICT_SEQUENCE_NUMBERS: envBool("FF_STRICT_SEQUENCE_NUMBERS", true),

  /** N12: Continuity SLO enforcement — auto-disable voice on breach */
  CONTINUITY_SLO_ENFORCEMENT: envBool("FF_CONTINUITY_SLO_ENFORCEMENT", true),

  /** N8: Enterprise source grounding — require sourceTurnIds on AI question turns */
  ENTERPRISE_SOURCE_GROUNDING_REQUIRED: envBool("FF_ENTERPRISE_SOURCE_GROUNDING_REQUIRED", false),

  // ── Round 15: Enterprise Audit Full Remediation ──────────────────────

  /** Fix 4: Atomic reconnect — require context hash verification before LIVE */
  ATOMIC_RECONNECT_VERIFICATION: envBool("FF_ATOMIC_RECONNECT_VERIFICATION", true),

  /** Fix 7: Context capsule protocol — server-assembled reconnect context (opt-in) */
  CONTEXT_CAPSULE_PROTOCOL: envBool("FF_CONTEXT_CAPSULE_PROTOCOL", false),

  /** Fix 8: Persona identity token — cryptographic persona lock verification (opt-in) */
  PERSONA_IDENTITY_TOKEN: envBool("FF_PERSONA_IDENTITY_TOKEN", false),
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
