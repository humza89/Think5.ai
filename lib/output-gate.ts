/**
 * Output Gate — Server-side pre-send policy checks for AI responses
 *
 * Runs on each AI turn at checkpoint time. Detects:
 * - Re-introductions after introDone
 * - Duplicate questions (against askedQuestionIds)
 * - Unsupported claims (against verified facts)
 *
 * Two modes:
 * - Warn-only (default): log + record, don't block
 * - Blocking (FF_OUTPUT_GATE_BLOCKING): sanitize or reject violating content
 */

import { hashQuestion } from "./interviewer-state";
import { extractAssertions, isClaimSupported } from "./grounding-gate";

// ── Types ────────────────────────────────────────────────────────────

export interface OutputGateInput {
  introDone: boolean;
  askedQuestionIds: string[];
  /** Full text of previously asked questions for semantic dedup */
  askedQuestionTexts?: string[];
  /** Question hashes explicitly allowed to repeat (intentional revisits) */
  revisitAllowList?: string[];
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

export interface GateAction {
  action: "pass" | "block";
  violations: GateViolation[];
  /** Sanitized response with violating content removed/replaced. Only present when action is "block". */
  sanitizedResponse?: string;
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
  /i'?m\s+your\s+interviewer/i,
  /i\s+am\s+the\s+interviewer/i,
  /let\s+me\s+start\s+by\s+introducing/i,
  /nice\s+to\s+meet\s+you/i,
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

// ── Tokenization for Semantic Dedup ──────────────────────────────────

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "was", "were", "are", "been", "be",
  "have", "has", "had", "do", "does", "did", "will", "would",
  "could", "should", "may", "might", "shall", "can",
  "i", "you", "he", "she", "it", "we", "they", "my", "your",
  "of", "in", "to", "for", "with", "on", "at", "by", "from",
  "and", "or", "but", "not", "that", "this", "these", "those",
  "about", "as", "into", "through", "during", "before", "after",
  "what", "how", "when", "where", "who", "which", "why",
  "tell", "me", "describe", "explain", "can",
]);

/**
 * Tokenize question text for semantic dedup comparison.
 * Strips stop words and short tokens to focus on content words.
 */
function tokenizeForDedup(text: string): string[] {
  return text
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

// ── Response Sanitization ────────────────────────────────────────────

/**
 * Strip violating content from AI response based on violation types.
 * Returns a cleaned response that passes policy checks.
 */
export function sanitizeResponse(
  aiResponse: string,
  violations: GateViolation[]
): string {
  let sanitized = aiResponse;

  // Process violations in priority order: reintroduction → unsupported claims → duplicates
  // This prevents order-dependent fragmentation
  const ordered = [...violations].sort((a, b) => {
    const priority: Record<string, number> = { reintroduction: 0, unsupported_claim: 1, duplicate_question: 2 };
    return (priority[a.type] ?? 3) - (priority[b.type] ?? 3);
  });

  for (const violation of ordered) {
    switch (violation.type) {
      case "reintroduction": {
        // Remove sentences matching intro patterns
        const sentences = sanitized.split(/(?<=[.!?])\s+/);
        const filtered = sentences.filter((sentence) =>
          !INTRO_PATTERNS.some((p) => p.test(sentence))
        );
        sanitized = filtered.join(" ").trim();
        break;
      }
      case "unsupported_claim": {
        // Strip the unsupported assertion clause
        const claimMatch = violation.detail.match(/Unsupported claim: "(.+?)"/);
        if (claimMatch) {
          const claim = claimMatch[1];
          const claimSentences = sanitized.split(/(?<=[.!?])\s+/);
          const cleanedSentences = claimSentences.filter(
            (s) => !s.toLowerCase().includes(claim.toLowerCase().slice(0, 50))
          );
          sanitized = cleanedSentences.join(" ").trim();
        }
        break;
      }
      case "duplicate_question": {
        // Replace the duplicate question with a transition marker
        const question = extractQuestion(sanitized);
        if (question) {
          sanitized = sanitized.replace(question, "Let me move on to the next topic.");
        }
        break;
      }
    }
  }

  // Ensure we don't return an empty response
  if (!sanitized.trim()) {
    sanitized = "Let's continue with the interview.";
  }

  return sanitized;
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

  // Check 2: No duplicate questions (hash-exact + semantic similarity)
  const question = extractQuestion(aiResponse);
  const hasHashIds = input.askedQuestionIds.length > 0;
  const hasTextIds = (input.askedQuestionTexts?.length ?? 0) > 0;
  if (question && (hasHashIds || hasTextIds)) {
    const qHash = hashQuestion(question);
    const isRevisitAllowed = input.revisitAllowList?.includes(qHash) ?? false;

    if (!isRevisitAllowed) {
      // Hash-exact dedup
      if (hasHashIds && input.askedQuestionIds.includes(qHash)) {
        violations.push({
          type: "duplicate_question",
          detail: `Duplicate question detected (hash: ${qHash}): "${question.slice(0, 100)}..."`,
          severity: "warn",
        });
      }
      // Semantic dedup: check Jaccard similarity against previously asked question texts
      else if (input.askedQuestionTexts && input.askedQuestionTexts.length > 0) {
        const questionWords = new Set(tokenizeForDedup(question.toLowerCase()));
        for (const prevQuestion of input.askedQuestionTexts) {
          const prevWords = new Set(tokenizeForDedup(prevQuestion.toLowerCase()));
          const intersection = new Set([...questionWords].filter((w) => prevWords.has(w)));
          const union = new Set([...questionWords, ...prevWords]);
          const jaccard = union.size > 0 ? intersection.size / union.size : 0;
          if (jaccard >= 0.6) {
            violations.push({
              type: "duplicate_question",
              detail: `Semantic duplicate (similarity: ${(jaccard * 100).toFixed(0)}%): "${question.slice(0, 80)}..." ≈ "${prevQuestion.slice(0, 80)}..."`,
              severity: "warn",
            });
            break; // One semantic match is enough
          }
        }
      }
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

// ── Blocking Gate Function ───────────────────────────────────────────

/**
 * Check an AI response and optionally block/sanitize violating content.
 * When blockingEnabled is true, violations are promoted to "block" severity
 * and a sanitized response is returned.
 */
export function checkOutputGateWithAction(
  aiResponse: string,
  input: OutputGateInput,
  blockingEnabled: boolean
): GateAction {
  const result = checkOutputGate(aiResponse, input);

  if (result.passed) {
    return { action: "pass", violations: [] };
  }

  if (!blockingEnabled) {
    // Warn-only mode: return violations but don't block
    return { action: "pass", violations: result.violations };
  }

  // Blocking mode: promote severity and sanitize
  const blockedViolations = result.violations.map((v) => ({
    ...v,
    severity: "block" as const,
  }));

  const sanitized = sanitizeResponse(aiResponse, blockedViolations);

  return {
    action: "block",
    violations: blockedViolations,
    sanitizedResponse: sanitized,
  };
}
