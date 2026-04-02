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
  groundedBy: { factContent: string; factType: string; similarity: number; turnId?: string } | null;
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
// CF3: Courtesy phrases that should NOT be extracted as factual claims
const COURTESY_EXCLUSIONS = [
  /you are welcome/i,
  /you have any questions/i,
  /you(?:'d| would) like to/i,
  /you are ready/i,
  /you are comfortable/i,
  /you are free to/i,
  /you have the (?:floor|opportunity)/i,
  /you(?:'re| are) doing (?:great|well|fine)/i,
  /you can (?:take|feel)/i,
  /you want to (?:add|share|ask)/i,
  /you(?:'d| would) prefer/i,
];

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

  // CF3: Broader attributive claims — "you have extensive...", "you demonstrated..."
  const attributivePatterns = [
    /you\s+(?:have|had|demonstrated|showed|displayed)\s+(.{10,150}?)(?:\.|,|;|$)/gi,
    /your\s+(?:team'?s?|project'?s?|company'?s?|approach|work|experience|background|expertise)\s+(.{10,150}?)(?:\.|,|;|$)/gi,
    /(?:as|since|given that)\s+you\s+(?:are|were)\s+(?:a|an|the)\s+(.{10,100}?)(?:\.|,|;|$)/gi,
  ];

  for (const pattern of attributivePatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const extracted = match[1].trim();
      // Filter out courtesy phrases that aren't factual claims
      const isCourteousPhrase = COURTESY_EXCLUSIONS.some(p => p.test(match![0]));
      if (!isCourteousPhrase && extracted.length >= 10) {
        assertions.push(extracted);
      }
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

// ── Follow-Up Grounding Check ──────────────────────────────────────

export interface FollowUpGroundingResult {
  grounded: boolean;
  groundingRef: string | null;
  flag: "UNGROUNDED_FOLLOWUP" | null;
}

/**
 * Check if a follow-up question/statement is grounded in recent conversation turns or facts.
 * Returns UNGROUNDED_FOLLOWUP flag if the follow-up references content not found
 * in any recent turn or fact.
 */
export function checkFollowUpGrounding(
  followUpText: string,
  recentTurns: Array<{ turnId: string; content: string }>,
  facts: Array<{ content: string; factType: string; turnId?: string }>
): FollowUpGroundingResult {
  const assertions = extractAssertions(followUpText);

  // No assertions to check — trivially grounded
  if (assertions.length === 0) {
    return { grounded: true, groundingRef: null, flag: null };
  }

  // Check against recent turns
  for (const assertion of assertions) {
    for (const turn of recentTurns) {
      const sim = computeSimilarity(assertion, turn.content);
      if (sim > 0.3) {
        return { grounded: true, groundingRef: turn.turnId, flag: null };
      }
    }
  }

  // Check against facts with turnId
  for (const assertion of assertions) {
    for (const fact of facts) {
      if (isClaimSupported(assertion, fact.content)) {
        return { grounded: true, groundingRef: fact.turnId || null, flag: null };
      }
    }
  }

  // Not grounded in any source
  return { grounded: false, groundingRef: null, flag: "UNGROUNDED_FOLLOWUP" };
}

// ── Hallucinated Reference Detection ─────────────────────────────────

export interface HallucinatedReferenceResult {
  hasHallucinatedReferences: boolean;
  hallucinatedReferences: Array<{
    assertion: string;
    bestFactMatch: { content: string; similarity: number } | null;
    bestTurnMatch: { content: string; turnId: string; similarity: number } | null;
  }>;
  verifiedReferences: string[];
  totalReferences: number;
}

/**
 * Extract REFERENCE assertions — direct claims about what the candidate
 * said, experienced, or did. These require stricter verification than
 * general claims because they put words in the candidate's mouth.
 */
export function extractReferenceAssertions(text: string): string[] {
  const assertions: string[] = [];

  const referencePatterns = [
    // Direct speech attribution
    /you\s+(?:mentioned|said|noted|told me|stated|indicated)\s+(?:that\s+)?(.{10,150}?)(?:\.|,|;|$)/gi,
    /(?:earlier|previously|before),?\s+you\s+(?:mentioned|said|told me|described)\s+(?:that\s+)?(.{10,150}?)(?:\.|,|;|$)/gi,
    // Experience attribution
    /your\s+(?:experience|work|time|role)\s+(?:at|with|as)\s+(.{3,80}?)(?:\.|,|;|$)/gi,
    /when you (?:were|worked)\s+(?:at|with|as)\s+(.{3,80}?)(?:\.|,|;|$)/gi,
    // Description attribution
    /as you (?:described|explained|shared|discussed)\s+(.{10,150}?)(?:\.|,|;|$)/gi,
    /you (?:talked|spoke)\s+about\s+(.{10,150}?)(?:\.|,|;|$)/gi,
    // Summary attribution
    /based on (?:your|what you)\s+(?:mentioned|said|shared|described)\s+(?:about\s+)?(.{10,100}?)(?:\.|,|;|$)/gi,
  ];

  for (const pattern of referencePatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const extracted = match[1].trim();
      const isCourtesy = COURTESY_EXCLUSIONS.some(p => p.test(match![0]));
      if (!isCourtesy && extracted.length >= 5) {
        assertions.push(extracted);
      }
    }
  }

  return [...new Set(assertions)];
}

/**
 * Detect hallucinated references — AI claims about what the candidate
 * said that cannot be verified against BOTH facts AND canonical turns.
 *
 * Uses STRICTER threshold (0.7) for turn matching than general grounding (0.5)
 * because attributing words to a candidate is high-stakes.
 */
export function detectHallucinatedReferences(
  responseText: string,
  facts: Array<{ content: string; factType: string; turnId?: string }>,
  recentTurns: Array<{ turnId: string; content: string }>,
): HallucinatedReferenceResult {
  const STRICT_THRESHOLD = 0.7;

  const referenceAssertions = extractReferenceAssertions(responseText);

  if (referenceAssertions.length === 0) {
    return {
      hasHallucinatedReferences: false,
      hallucinatedReferences: [],
      verifiedReferences: [],
      totalReferences: 0,
    };
  }

  const hallucinated: HallucinatedReferenceResult["hallucinatedReferences"] = [];
  const verified: string[] = [];

  for (const assertion of referenceAssertions) {
    let bestFactMatch: { content: string; similarity: number } | null = null;
    let bestTurnMatch: { content: string; turnId: string; similarity: number } | null = null;
    let isVerified = false;

    // Check against facts using existing isClaimSupported (Jaccard ≥ 0.5 + substring + number)
    for (const fact of facts) {
      const sim = computeSimilarity(assertion, fact.content);
      if (!bestFactMatch || sim > bestFactMatch.similarity) {
        bestFactMatch = { content: fact.content, similarity: sim };
      }
      if (isClaimSupported(assertion, fact.content)) {
        isVerified = true;
        break;
      }
    }

    // If not verified by facts, check against recent canonical turns (STRICT threshold)
    if (!isVerified) {
      for (const turn of recentTurns) {
        const sim = computeSimilarity(assertion, turn.content);
        if (!bestTurnMatch || sim > bestTurnMatch.similarity) {
          bestTurnMatch = { content: turn.content, turnId: turn.turnId, similarity: sim };
        }
        if (sim >= STRICT_THRESHOLD) {
          isVerified = true;
          break;
        }
      }
    }

    if (isVerified) {
      verified.push(assertion);
    } else {
      hallucinated.push({ assertion, bestFactMatch, bestTurnMatch });
    }
  }

  return {
    hasHallucinatedReferences: hallucinated.length > 0,
    hallucinatedReferences: hallucinated,
    verifiedReferences: verified,
    totalReferences: referenceAssertions.length,
  };
}
