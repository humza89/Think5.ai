/**
 * Output Gate — Server-side pre-send policy checks for AI responses
 *
 * Runs on each AI turn at checkpoint time. Detects:
 * - Re-introductions after introDone
 * - Duplicate questions (against askedQuestionIds)
 * - Unsupported claims (against verified facts)
 *
 * Initial mode: warn-only (log + record, don't block).
 * Future: promote to block mode with re-generation.
 */

import { hashQuestion } from "./interviewer-state";
import { extractAssertions, isClaimSupported } from "./grounding-gate";

// ── Types ────────────────────────────────────────────────────────────

export interface OutputGateInput {
  introDone: boolean;
  askedQuestionIds: string[];
  verifiedFacts: Array<{ factType: string; content: string; confidence: number }>;
}

export interface GateViolation {
  type: "reintroduction" | "duplicate_question" | "unsupported_claim";
  detail: string;
  severity: "block" | "warn";
}

export interface GateResult {
  passed: boolean;
  violations: GateViolation[];
}

// ── Intro Detection Patterns ─────────────────────────────────────────
// Same patterns used client-side, now enforced server-side

const INTRO_PATTERNS = [
  /hi,?\s+i'?m\s+aria/i,
  /welcome\s+to/i,
  /thanks?\s+for\s+joining/i,
  /let\s+me\s+introduce/i,
  /i'll\s+be\s+conducting/i,
  /my\s+name\s+is/i,
];

// ── Question Extraction ──────────────────────────────────────────────

/**
 * Extract the question portion from an AI response.
 * AI responses often contain acknowledgment + transition + question.
 * We extract the interrogative part for dedup checking.
 */
function extractQuestion(text: string): string | null {
  // Look for the last sentence ending with "?"
  const sentences = text.split(/(?<=[.!?])\s+/);
  for (let i = sentences.length - 1; i >= 0; i--) {
    if (sentences[i].trim().endsWith("?")) {
      return sentences[i].trim();
    }
  }
  return null;
}

// ── Main Gate Function ───────────────────────────────────────────────

/**
 * Check an AI response against output policies.
 * Returns pass/fail with any violations found.
 */
export function checkOutputGate(
  aiResponse: string,
  input: OutputGateInput
): GateResult {
  const violations: GateViolation[] = [];

  // Check 1: No re-introduction after introDone
  if (input.introDone) {
    for (const pattern of INTRO_PATTERNS) {
      if (pattern.test(aiResponse)) {
        violations.push({
          type: "reintroduction",
          detail: `Detected re-introduction pattern after introDone: ${pattern.source}`,
          severity: "warn",
        });
        break; // One violation per type is enough
      }
    }
  }

  // Check 2: No duplicate questions
  const question = extractQuestion(aiResponse);
  if (question && input.askedQuestionIds.length > 0) {
    const qHash = hashQuestion(question);
    if (input.askedQuestionIds.includes(qHash)) {
      violations.push({
        type: "duplicate_question",
        detail: `Duplicate question detected (hash: ${qHash}): "${question.slice(0, 100)}..."`,
        severity: "warn",
      });
    }
  }

  // Check 3: No unsupported claims about candidate
  if (input.verifiedFacts.length > 0) {
    const assertions = extractAssertions(aiResponse);
    for (const assertion of assertions) {
      const supported = input.verifiedFacts.some((fact) =>
        isClaimSupported(assertion, fact.content)
      );
      if (!supported) {
        violations.push({
          type: "unsupported_claim",
          detail: `Unsupported claim: "${assertion.slice(0, 100)}"`,
          severity: "warn",
        });
      }
    }
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}
