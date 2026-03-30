/**
 * Memory Fidelity Scorer — Measures recall precision and coverage
 *
 * Compares the system's memory (retrieved context) against ground-truth
 * transcript facts to produce quantitative fidelity scores.
 *
 * Used in eval tests and production monitoring to ensure Aria's memory
 * accurately reflects what the candidate actually said.
 */

// ── Types ────────────────────────────────────────────────────────────

export interface MemoryFidelityScore {
  recall: number;       // 0-1: fraction of ground-truth facts found in memory
  precision: number;    // 0-1: fraction of memory facts that are accurate
  coverage: number;     // 0-1: fraction of turns with at least one memory reference
  missingFacts: string[];
  phantomFacts: string[];
  turnCoverage: { covered: number; total: number };
}

export interface GroundTruthFact {
  content: string;
  factType: string;
  turnIndex?: number;
}

// ── Scoring ──────────────────────────────────────────────────────────

/**
 * Score memory fidelity against ground-truth facts.
 *
 * @param retrievedFacts - Facts from the memory system (e.g., from composeMemoryPacket)
 * @param groundTruthFacts - Known correct facts from the transcript
 * @param turnCount - Total number of turns in the interview
 * @param turnsWithFacts - Set of turn indices that have at least one fact
 */
export function scoreMemoryFidelity(
  retrievedFacts: Array<{ factType: string; content: string; confidence: number }>,
  groundTruthFacts: GroundTruthFact[],
  turnCount: number,
  turnsWithFacts: Set<number>
): MemoryFidelityScore {
  // Recall: how many ground-truth facts are present in retrieved facts
  const missingFacts: string[] = [];
  let recallMatches = 0;

  for (const gt of groundTruthFacts) {
    const found = retrievedFacts.some((rf) =>
      isFuzzyMatch(rf.content, gt.content) && rf.factType === gt.factType
    );
    if (found) {
      recallMatches++;
    } else {
      missingFacts.push(`${gt.factType}: ${gt.content}`);
    }
  }

  const recall = groundTruthFacts.length > 0 ? recallMatches / groundTruthFacts.length : 1.0;

  // Precision: how many retrieved facts correspond to real content
  const phantomFacts: string[] = [];
  let precisionMatches = 0;

  for (const rf of retrievedFacts) {
    const matchesGT = groundTruthFacts.some((gt) =>
      isFuzzyMatch(rf.content, gt.content)
    );
    if (matchesGT) {
      precisionMatches++;
    } else {
      phantomFacts.push(`${rf.factType}: ${rf.content}`);
    }
  }

  const precision = retrievedFacts.length > 0 ? precisionMatches / retrievedFacts.length : 1.0;

  // Coverage: fraction of turns referenced by memory
  const coverage = turnCount > 0 ? turnsWithFacts.size / turnCount : 1.0;

  return {
    recall,
    precision,
    coverage,
    missingFacts,
    phantomFacts,
    turnCoverage: { covered: turnsWithFacts.size, total: turnCount },
  };
}

// ── Fuzzy Matching ───────────────────────────────────────────────────

/**
 * Check if two fact content strings are a fuzzy match.
 * Uses lowercased word overlap (Jaccard similarity ≥ 0.35) and prefix matching.
 */
function isFuzzyMatch(a: string, b: string): boolean {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();

  // Substring match (fast path)
  if (aLower.includes(bLower) || bLower.includes(aLower)) return true;

  // Jaccard similarity on meaningful words (with prefix matching for partial words)
  const aWords = new Set(tokenize(aLower));
  const bWords = new Set(tokenize(bLower));

  // Direct matches + prefix matches (e.g., "infra" matches "infrastructure")
  let matchCount = 0;
  for (const aw of aWords) {
    for (const bw of bWords) {
      if (aw === bw || aw.startsWith(bw) || bw.startsWith(aw)) {
        matchCount++;
        break;
      }
    }
  }

  const union = new Set([...aWords, ...bWords]);
  const jaccard = union.size > 0 ? matchCount / union.size : 0;

  return jaccard >= 0.35;
}

function tokenize(text: string): string[] {
  return text
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}
