/**
 * Semantic Contradiction Detector — Multi-dimensional fact consistency checker
 *
 * Extends the existing regex-based contradiction detection with:
 * 1. Temporal contradictions: impossible date ranges
 * 2. Entity-scope contradictions: person/scope mismatches
 * 3. Numeric contradictions: significant quantity mismatches
 *
 * Used as a pre-commit gate: before committing an AI turn that references
 * facts, the detector checks for new contradictions and flags them.
 */

import type { ExtractedFact } from "./fact-extractor";

// ── Types ────────────────────────────────────────────────────────────

export interface SemanticContradiction {
  type: "numeric" | "temporal" | "entity_scope";
  factA: { turnId: string; content: string; factType: string };
  factB: { turnId: string; content: string; factType: string };
  description: string;
  confidence: number; // 0-1, how certain we are this is a real contradiction
}

export interface ContradictionCheckResult {
  hasContradictions: boolean;
  contradictions: SemanticContradiction[];
}

// ── Temporal Extraction ──────────────────────────────────────────────

interface DateRange {
  startYear?: number;
  endYear?: number;
  duration?: number;
}

/**
 * Extract temporal information from text.
 * Handles: "from 2019 to 2022", "in 2020", "5 years", "since 2018", "left in 2020"
 */
export function extractTemporalInfo(text: string): DateRange | null {
  const rangeMatch = text.match(/(20\d{2})\s*(?:to|-|–)\s*(20\d{2})/);
  if (rangeMatch) {
    return {
      startYear: parseInt(rangeMatch[1]),
      endYear: parseInt(rangeMatch[2]),
      duration: parseInt(rangeMatch[2]) - parseInt(rangeMatch[1]),
    };
  }

  const sinceMatch = text.match(/since\s+(20\d{2})/i);
  if (sinceMatch) {
    return { startYear: parseInt(sinceMatch[1]) };
  }

  const leftMatch = text.match(/left\s+(?:in\s+)?(20\d{2})/i);
  if (leftMatch) {
    return { endYear: parseInt(leftMatch[1]) };
  }

  const inMatch = text.match(/in\s+(20\d{2})/i);
  if (inMatch) {
    return { startYear: parseInt(inMatch[1]), endYear: parseInt(inMatch[1]) };
  }

  const durationMatch = text.match(/(\d+)\s+years?/i);
  if (durationMatch) {
    return { duration: parseInt(durationMatch[1]) };
  }

  return null;
}

// ── Scope Extraction ─────────────────────────────────────────────────

interface ScopeInfo {
  scale: "solo" | "small_team" | "large_team" | "organization" | "unknown";
  count?: number;
}

/**
 * Extract scope/scale information from text.
 * Detects: "solo", "by myself", "team of 5", "200 engineers", "entire org"
 */
export function extractScopeInfo(text: string): ScopeInfo {
  const lower = text.toLowerCase();

  if (lower.includes("solo") || lower.includes("by myself") || lower.includes("on my own") || lower.includes("single-handedly")) {
    return { scale: "solo", count: 1 };
  }

  const teamMatch = text.match(/(?:team|group)\s+of\s+(\d+)/i);
  if (teamMatch) {
    const count = parseInt(teamMatch[1]);
    if (count <= 1) return { scale: "solo", count };
    if (count <= 10) return { scale: "small_team", count };
    return { scale: "large_team", count };
  }

  const countMatch = text.match(/(\d+)\s+(?:engineers?|developers?|people|members?|reports?)/i);
  if (countMatch) {
    const count = parseInt(countMatch[1]);
    if (count <= 1) return { scale: "solo", count };
    if (count <= 10) return { scale: "small_team", count };
    return { scale: "large_team", count };
  }

  if (lower.includes("entire") || lower.includes("organization") || lower.includes("company-wide")) {
    return { scale: "organization" };
  }

  return { scale: "unknown" };
}

// ── Entity Extraction ────────────────────────────────────────────────

/**
 * Extract the primary entity (company/project) from fact content.
 */
function extractEntity(text: string): string | null {
  const atMatch = text.match(/(?:at|with|for)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)/);
  if (atMatch) return atMatch[1].toLowerCase();

  const companyPatterns = [
    "google", "meta", "facebook", "amazon", "apple", "microsoft", "netflix",
    "uber", "lyft", "airbnb", "stripe", "twitter", "linkedin",
  ];
  const lower = text.toLowerCase();
  for (const company of companyPatterns) {
    if (lower.includes(company)) return company;
  }

  return null;
}

// ── Number Extraction ────────────────────────────────────────────────

function extractNumbers(text: string): number[] {
  const matches = text.match(/\d+(?:\.\d+)?/g);
  return matches ? matches.map(Number) : [];
}

// ── Core Detection ───────────────────────────────────────────────────

/**
 * Check a new fact against all existing facts for semantic contradictions.
 */
export function detectContradictions(
  newFact: ExtractedFact,
  existingFacts: ExtractedFact[]
): SemanticContradiction[] {
  const contradictions: SemanticContradiction[] = [];

  for (const existing of existingFacts) {
    // Skip same-turn comparisons
    if (newFact.turnId === existing.turnId) continue;

    // Must share an entity context to be comparable
    const newEntity = extractEntity(newFact.content);
    const existingEntity = extractEntity(existing.content);
    const sharedEntity = newEntity && existingEntity && newEntity === existingEntity;

    // 1. Numeric contradictions: same context, different numbers (>30% divergence)
    if (newFact.factType === existing.factType || sharedEntity) {
      const newNums = extractNumbers(newFact.content);
      const existNums = extractNumbers(existing.content);

      if (newNums.length > 0 && existNums.length > 0 && sharedEntity) {
        for (const n of newNums) {
          for (const e of existNums) {
            const max = Math.max(Math.abs(n), Math.abs(e));
            if (max > 0 && Math.abs(n - e) / max > 0.3) {
              contradictions.push({
                type: "numeric",
                factA: { turnId: existing.turnId, content: existing.content, factType: existing.factType },
                factB: { turnId: newFact.turnId, content: newFact.content, factType: newFact.factType },
                description: `Numeric mismatch for ${newEntity || "entity"}: ${e} vs ${n}`,
                confidence: 0.8,
              });
            }
          }
        }
      }
    }

    // 2. Temporal contradictions: impossible date ranges for same entity
    if (sharedEntity) {
      const newTemporal = extractTemporalInfo(newFact.content);
      const existTemporal = extractTemporalInfo(existing.content);

      if (newTemporal && existTemporal) {
        // Left before promoted
        if (existTemporal.endYear && newTemporal.startYear && newTemporal.startYear > existTemporal.endYear) {
          // "left Google in 2020" vs "promoted at Google in 2022" — temporal impossibility
          const afterLeaving =
            existing.content.toLowerCase().includes("left") ||
            existing.content.toLowerCase().includes("quit");
          const impliesPresence =
            newFact.content.toLowerCase().includes("promoted") ||
            newFact.content.toLowerCase().includes("led") ||
            newFact.content.toLowerCase().includes("managed");

          if (afterLeaving && impliesPresence) {
            contradictions.push({
              type: "temporal",
              factA: { turnId: existing.turnId, content: existing.content, factType: existing.factType },
              factB: { turnId: newFact.turnId, content: newFact.content, factType: newFact.factType },
              description: `Temporal impossibility for ${newEntity}: activity after departure`,
              confidence: 0.85,
            });
          }
        }

        // Duration mismatch: "5 years at X" vs "2019-2020 at X" (1 year)
        if (newTemporal.duration && existTemporal.duration) {
          const diff = Math.abs(newTemporal.duration - existTemporal.duration);
          if (diff >= 2) {
            contradictions.push({
              type: "temporal",
              factA: { turnId: existing.turnId, content: existing.content, factType: existing.factType },
              factB: { turnId: newFact.turnId, content: newFact.content, factType: newFact.factType },
              description: `Duration mismatch for ${newEntity}: ${existTemporal.duration}y vs ${newTemporal.duration}y`,
              confidence: 0.75,
            });
          }
        }
      }
    }

    // 3. Entity-scope contradictions: "built it solo" vs "team of 5 built it"
    if (sharedEntity || (newFact.factType === "RESPONSIBILITY" && existing.factType === "RESPONSIBILITY")) {
      const newScope = extractScopeInfo(newFact.content);
      const existScope = extractScopeInfo(existing.content);

      if (
        newScope.scale !== "unknown" &&
        existScope.scale !== "unknown" &&
        newScope.scale !== existScope.scale
      ) {
        // Only flag if the mismatch is significant (solo vs team, or small vs large)
        const significantMismatch =
          (newScope.scale === "solo" && existScope.scale !== "solo") ||
          (existScope.scale === "solo" && newScope.scale !== "solo") ||
          (newScope.scale === "small_team" && existScope.scale === "large_team") ||
          (newScope.scale === "large_team" && existScope.scale === "small_team");

        if (significantMismatch) {
          contradictions.push({
            type: "entity_scope",
            factA: { turnId: existing.turnId, content: existing.content, factType: existing.factType },
            factB: { turnId: newFact.turnId, content: newFact.content, factType: newFact.factType },
            description: `Scope mismatch: "${existScope.scale}" (${existScope.count || "?"}p) vs "${newScope.scale}" (${newScope.count || "?"}p)`,
            confidence: 0.7,
          });
        }
      }
    }
  }

  return contradictions;
}

/**
 * Batch check: find all contradictions in a set of facts.
 */
export function findAllContradictions(
  facts: ExtractedFact[]
): SemanticContradiction[] {
  const contradictions: SemanticContradiction[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < facts.length; i++) {
    for (let j = i + 1; j < facts.length; j++) {
      const found = detectContradictions(facts[i], [facts[j]]);
      for (const c of found) {
        const key = `${c.factA.turnId}:${c.factB.turnId}:${c.type}`;
        if (!seen.has(key)) {
          seen.add(key);
          contradictions.push(c);
        }
      }
    }
  }

  return contradictions;
}
