/**
 * Network Invariant Guard — Enforces logic/network decoupling contract
 *
 * INVARIANT: `connectionQuality` must NEVER influence server-side logic paths.
 * All gates (output, grounding, contradiction, memory confidence) run identically
 * regardless of client bandwidth conditions.
 *
 * `connectionQuality` is only permitted to affect:
 * - UI display (connection indicator, reconnect banner)
 * - Checkpoint frequency (more frequent under poor network)
 * - Audio quality hints (codec bitrate suggestions)
 *
 * This module provides runtime assertions and static analysis helpers to
 * enforce this contract across the codebase.
 */

// ── Allowed usages of connectionQuality ──────────────────────────────

/**
 * Exhaustive list of contexts where `connectionQuality` may be read.
 * Any usage outside these contexts is a logic-coupling violation.
 */
export const ALLOWED_CONNECTION_QUALITY_CONTEXTS = [
  "ui_display",           // Rendering connection status indicators
  "checkpoint_frequency", // Adjusting checkpoint interval (not logic)
  "audio_quality_hint",   // Suggesting codec parameters
  "reconnect_ui",         // Displaying reconnect phase banners
  "analytics",            // Logging network quality for observability
] as const;

export type AllowedContext = typeof ALLOWED_CONNECTION_QUALITY_CONTEXTS[number];

// ── Runtime Assertion ────────────────────────────────────────────────

/**
 * Assert that a connectionQuality access is happening in an allowed context.
 * Call this in development builds at any site that reads connectionQuality
 * to enforce the decoupling contract at runtime.
 *
 * @throws Error in development if context is not in the allowed list
 */
export function assertNetworkInvariant(
  context: string,
  connectionQuality: string
): void {
  const isAllowed = ALLOWED_CONNECTION_QUALITY_CONTEXTS.includes(context as AllowedContext);
  if (!isAllowed) {
    const msg = `[NetworkInvariant] VIOLATION: connectionQuality="${connectionQuality}" accessed in disallowed context="${context}". ` +
      `connectionQuality must NEVER influence logic paths. Allowed contexts: ${ALLOWED_CONNECTION_QUALITY_CONTEXTS.join(", ")}`;
    console.error(msg);
    if (process.env.NODE_ENV !== "production") {
      throw new Error(msg);
    }
  }
}

// ── Static Analysis Helpers ──────────────────────────────────────────

/**
 * Patterns that indicate logic-coupling violations when found near
 * `connectionQuality` in source code.
 *
 * Used by static analysis tests to grep for violations.
 */
export const LOGIC_COUPLING_PATTERNS = [
  // Conditional logic branches
  /if\s*\(\s*connectionQuality\s*[!=]==?\s*["']\w+["']\s*\)/,
  /connectionQuality\s*[!=]==?\s*["']\w+["']\s*\?\s*/,
  /switch\s*\(\s*connectionQuality\s*\)/,
  // Using connectionQuality to determine question logic
  /connectionQuality.*(?:question|topic|module|difficulty|skip)/i,
  // Using connectionQuality in memory/context decisions
  /connectionQuality.*(?:memory|context|fact|ground|gate)/i,
  // Using connectionQuality in state machine decisions (exclude React useState declarations)
  /connectionQuality\s*(?:===|!==|==|!=|&&|\|\|)\s*.*(?:transition|state|phase|step)/i,
] as const;

/**
 * Files that should NEVER contain connectionQuality references.
 * These are server-side logic files where network quality is irrelevant.
 */
export const BANNED_FILES = [
  "lib/session-brain.ts",
  "lib/interviewer-state.ts",
  "lib/memory-orchestrator.ts",
  "lib/memory-truth-service.ts",
  "lib/fact-extractor.ts",
  "lib/grounding-gate.ts",
  "lib/output-gate.ts",
  "lib/semantic-contradiction-detector.ts",
  "lib/conversation-ledger.ts",
  "lib/replay-reconstructor.ts",
] as const;
