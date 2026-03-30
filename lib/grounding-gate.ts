/**
 * Grounding Gate — Anti-hallucination verification for AI responses
 *
 * Verifies that AI-generated claims are supported by Tier 1 facts from the
 * canonical ledger. Blocks unsupported claims before they reach the candidate
 * or appear in reports.
 *
 * Uses fuzzy matching (Jaccard similarity + normalized number comparison)
 * to handle paraphrasing and approximate references.
 */

import type { ExtractedFact } from "./fact-extractor";

// ── Types ────────────────────────────────────────────────────────────

export interface ClaimProvenance {
  claim: string;
  groundedBy: { factContent: string; factType: string; similarity: number } | null;
}

export interface GroundingResult {
  grounded: boolean;
  score: number; // 0-1, where 1 = all claims verified
  supportedClaims: string[];
  unsupportedClaims: string[];
  totalClaims: number;
  provenance: ClaimProvenance[];
}

// ── Assertion Extraction ─────────────────────────────────────────────

/**
 * Extract factual assertions from AI-generated text.
 * Pulls references to candidate statements, numbers, companies, timelines.
 */
export function extractAssertions(text: string): string[] {
  const assertions: string[] = [];

  // References to what the candidate said: "you mentioned", "you said", "you noted"
  const referencePatterns = [
    /you\s+(?:mentioned|said|noted|discussed|described|explained|shared|indicated|stated|told me)\s+(?:that\s+)?(.{10,150}?)(?:\.|,|$)/gi,
    /(?:earlier|previously|before),?\s+you\s+(?:mentioned|said|told me)\s+(?:that\s+)?(.{10,150}?)(?:\.|,|$)/gi,
    /based on (?:your|what you)\s+(?:mentioned|said|shared)\s+(?:about\s+)?(.{10,100}?)(?:\.|,|$)/gi,
  ];

  for (const pattern of referencePatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      assertions.push(match[1].trim());
    }
  }

  // Specific claims about numbers: "your 5 years", "the 40% improvement"
  const numberClaims = [
    /your\s+(\d+(?:\.\d+)?)\s+years?\s+(?:at|of|with)\s+(.{3,50})/gi,
    /the\s+(\d+(?:\.\d+)?)\s*%\s+(?:improvement|reduction|increase|decrease)/gi,
    /(\d+(?:\.\d+)?)\s+(?:team members|engineers|reports|people)/gi,
  ];

  for (const pattern of numberClaims) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      assertions.push(match[0].trim());
    }
  }

  // Company/role references: "your time at Google", "your role as"
  const entityClaims = [
    /your\s+(?:time|role|work|experience|position)\s+(?:at|with|as)\s+(.{3,80}?)(?:\.|,|$)/gi,
    /when you (?:were|worked)\s+(?:at|with|as)\s+(.{3,80}?)(?:\.|,|$)/gi,
  ];

  for (const pattern of entityClaims) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      assertions.push(match[1].trim());
    }
  }

  // Deduplicate
  return [...new Set(assertions)];
}

// ── Grounding Verification ──────────────────────────────────────────

/**
 * Verify that AI assertions are supported by extracted facts.
 * Returns a GroundingResult indicating which claims pass and which don't.
 */
export function verifyGrounding(
  responseText: string,
  facts: ExtractedFact[]
): GroundingResult {
  const assertions = extractAssertions(responseText);

  if (assertions.length === 0) {
    return {
      grounded: true,
      score: 1.0,
      supportedClaims: [],
      unsupportedClaims: [],
      totalClaims: 0,
      provenance: [],
    };
  }

  const supportedClaims: string[] = [];
  const unsupportedClaims: string[] = [];
  const provenance: ClaimProvenance[] = [];

  for (const assertion of assertions) {
    let bestMatch: { factContent: string; factType: string; similarity: number } | null = null;
    let bestSimilarity = 0;

    for (const fact of facts) {
      const sim = computeSimilarity(assertion, fact.content);
      if (sim > bestSimilarity) {
        bestSimilarity = sim;
        bestMatch = { factContent: fact.content, factType: fact.factType, similarity: sim };
      }
    }

    const isSupported = bestMatch !== null && isClaimSupported(assertion, bestMatch.factContent);

    if (isSupported) {
      supportedClaims.push(assertion);
      provenance.push({ claim: assertion, groundedBy: bestMatch });
    } else {
      unsupportedClaims.push(assertion);
      provenance.push({ claim: assertion, groundedBy: null });
    }
  }

  const score =
    assertions.length > 0 ? supportedClaims.length / assertions.length : 1.0;

  return {
    grounded: unsupportedClaims.length === 0,
    score,
    supportedClaims,
    unsupportedClaims,
    totalClaims: assertions.length,
    provenance,
  };
}

// ── Similarity Matching ─────────────────────────────────────────────

/**
 * Check if a claim is supported by a fact using fuzzy matching.
 * Combines Jaccard word overlap with number normalization.
 */
export function isClaimSupported(claim: string, factContent: string): boolean {
  const claimLower = claim.toLowerCase();
  const factLower = factContent.toLowerCase();

  // Exact substring match (fast path)
  if (factLower.includes(claimLower) || claimLower.includes(factLower)) {
    return true;
  }

  // Jaccard similarity on word sets
  const claimWords = new Set(tokenize(claimLower));
  const factWords = new Set(tokenize(factLower));

  const intersection = new Set([...claimWords].filter((w) => factWords.has(w)));
  const union = new Set([...claimWords, ...factWords]);

  const jaccard = union.size > 0 ? intersection.size / union.size : 0;

  // Number-aware comparison: extract numbers and compare (5% tolerance for enterprise precision)
  const claimNumbers = extractNumbers(claim);
  const factNumbers = extractNumbers(factContent);
  const numberMatch =
    claimNumbers.length > 0 &&
    claimNumbers.some((cn) =>
      factNumbers.some((fn) => Math.abs(cn - fn) / Math.max(cn, fn, 1) < 0.05)
    );

  // Thresholds: Jaccard ≥ 0.5 OR (Jaccard ≥ 0.3 AND numbers match)
  // Raised from 0.4/0.25 to reduce false-positive grounding on wrong entities
  return jaccard >= 0.5 || (jaccard >= 0.3 && numberMatch);
}

/**
 * Compute raw Jaccard similarity between claim and fact text.
 * Used for provenance tracking (returns 0-1 score).
 */
function computeSimilarity(claim: string, factContent: string): number {
  const claimWords = new Set(tokenize(claim.toLowerCase()));
  const factWords = new Set(tokenize(factContent.toLowerCase()));
  const intersection = new Set([...claimWords].filter((w) => factWords.has(w)));
  const union = new Set([...claimWords, ...factWords]);
  return union.size > 0 ? intersection.size / union.size : 0;
}

/**
 * Tokenize text into meaningful words (removes stop words and short tokens).
 */
function tokenize(text: string): string[] {
  const stopWords = new Set([
    "the", "a", "an", "is", "was", "were", "are", "been", "be",
    "have", "has", "had", "do", "does", "did", "will", "would",
    "could", "should", "may", "might", "shall", "can",
    "i", "you", "he", "she", "it", "we", "they", "my", "your",
    "of", "in", "to", "for", "with", "on", "at", "by", "from",
    "and", "or", "but", "not", "that", "this", "these", "those",
    "about", "as", "into", "through", "during", "before", "after",
  ]);

  return text
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));
}

/**
 * Extract numeric values from text for number-aware comparison.
 */
function extractNumbers(text: string): number[] {
  const matches = text.match(/\d+(?:\.\d+)?/g);
  return matches ? matches.map(Number) : [];
}
