/**
 * Transcript Validator — Quality assurance for interview transcripts
 *
 * Checks for: duplicate questions, empty fragments, system prompt leakage,
 * consecutive same-role turns, suspicious patterns, timestamp anomalies,
 * turn index gaps, and provides auto-repair heuristics.
 */

export interface TranscriptIssue {
  type:
    | "duplicate_question"
    | "empty_fragment"
    | "prompt_leakage"
    | "consecutive_role"
    | "suspicious_pattern"
    | "non_sequitur"
    | "missing_turn_index"
    | "timestamp_anomaly"
    | "integrity_mismatch";
  severity: "warning" | "error";
  message: string;
  turnIndex?: number;
}

export interface TranscriptValidationResult {
  valid: boolean;
  issues: TranscriptIssue[];
}

export interface TranscriptRepairResult {
  repaired: Array<{ role: string; text: string; timestamp: string }>;
  repairs: string[];
}

// Patterns that indicate system prompt content leaked into transcript
const LEAKAGE_PATTERNS = [
  /you are (a|an) (top|elite|senior|expert)/i,
  /system prompt/i,
  /\bForbidden Behaviors?\b/i,
  /\bRecovery Logic\b/i,
  /\bDeep Dive Engine\b/i,
  /\bPersonalization Engine\b/i,
  /\bVoice Output Rules?\b/i,
  /\[INTERNAL\]/i,
  /\bxml version\b/i,
  /\bsystem_prompt\b/i,
];

/**
 * Normalize text for comparison — lowercase, strip punctuation, collapse whitespace.
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Simple word-overlap similarity (Jaccard index on word sets).
 * Returns 0–1 where 1 means identical word sets.
 */
function wordSimilarity(a: string, b: string): number {
  const setA = new Set(normalize(a).split(" ").filter(Boolean));
  const setB = new Set(normalize(b).split(" ").filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}

/**
 * Validate a transcript array for quality issues.
 * Returns { valid, issues[] } — issues are warnings/errors but don't block submission.
 */
export function validateTranscript(
  entries: Array<{ role: string; text?: string; content?: string; timestamp?: string }>
): TranscriptValidationResult {
  const issues: TranscriptIssue[] = [];

  if (!entries || entries.length === 0) {
    return { valid: true, issues: [] };
  }

  const aiTurns: { text: string; index: number }[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const text = entry.text || entry.content || "";

    // Check for empty fragments
    if (!text || text.trim().length === 0) {
      issues.push({
        type: "empty_fragment",
        severity: "warning",
        message: `Turn ${i} has empty content (role: ${entry.role})`,
        turnIndex: i,
      });
      continue;
    }

    // Check for system prompt leakage
    for (const pattern of LEAKAGE_PATTERNS) {
      if (pattern.test(text)) {
        issues.push({
          type: "prompt_leakage",
          severity: "error",
          message: `Turn ${i} may contain system prompt leakage: matched "${pattern.source}"`,
          turnIndex: i,
        });
        break;
      }
    }

    // Check for consecutive same-role turns
    if (i > 0) {
      const prevRole = entries[i - 1].role;
      if (prevRole === entry.role && entry.role === "interviewer") {
        issues.push({
          type: "consecutive_role",
          severity: "warning",
          message: `Consecutive interviewer turns at index ${i - 1} and ${i}`,
          turnIndex: i,
        });
      }
    }

    // Collect AI turns for duplicate detection
    if (entry.role === "interviewer" && text.trim().length > 20) {
      aiTurns.push({ text: text.trim(), index: i });
    }
  }

  // Duplicate question detection (Jaccard similarity > 0.8)
  for (let i = 0; i < aiTurns.length; i++) {
    for (let j = i + 1; j < aiTurns.length; j++) {
      const similarity = wordSimilarity(aiTurns[i].text, aiTurns[j].text);
      if (similarity > 0.8) {
        issues.push({
          type: "duplicate_question",
          severity: "warning",
          message: `AI turns ${aiTurns[i].index} and ${aiTurns[j].index} are ${(similarity * 100).toFixed(0)}% similar`,
          turnIndex: aiTurns[j].index,
        });
      }
    }
  }

  // Non-sequitur detection: consecutive AI turns with very low topic overlap
  const TRANSITION_PHRASES = ["let's", "moving on", "shift", "switch", "next", "different", "another", "now let"];
  for (let i = 1; i < aiTurns.length; i++) {
    const prev = aiTurns[i - 1];
    const curr = aiTurns[i];
    const similarity = wordSimilarity(prev.text, curr.text);
    const isTransition = TRANSITION_PHRASES.some((p) => curr.text.toLowerCase().includes(p));
    if (similarity < 0.1 && !isTransition && curr.text.length > 30) {
      issues.push({
        type: "non_sequitur",
        severity: "warning",
        message: `Potential non-sequitur at AI turn ${curr.index} (${(similarity * 100).toFixed(0)}% topic overlap with previous AI turn)`,
        turnIndex: curr.index,
      });
    }
  }

  // Timestamp validation: verify chronological order
  const timestampIssues = validateTimestamps(entries);
  issues.push(...timestampIssues);

  // Turn index gap detection
  const turnIndexIssues = validateTurnIndices(entries);
  issues.push(...turnIndexIssues);

  return {
    valid: issues.filter((i) => i.severity === "error").length === 0,
    issues,
  };
}

/**
 * Validate timestamps are in chronological order and flag >10 minute gaps.
 */
export function validateTimestamps(
  entries: Array<{ role: string; text?: string; content?: string; timestamp?: string }>
): TranscriptIssue[] {
  const issues: TranscriptIssue[] = [];
  let prevTime: number | null = null;

  for (let i = 0; i < entries.length; i++) {
    const ts = entries[i].timestamp;
    if (!ts) continue;

    const time = new Date(ts).getTime();
    if (isNaN(time)) {
      issues.push({
        type: "timestamp_anomaly",
        severity: "warning",
        message: `Turn ${i} has invalid timestamp: "${ts}"`,
        turnIndex: i,
      });
      continue;
    }

    if (prevTime !== null) {
      if (time < prevTime) {
        issues.push({
          type: "timestamp_anomaly",
          severity: "warning",
          message: `Turn ${i} timestamp is before previous turn (${new Date(time).toISOString()} < ${new Date(prevTime).toISOString()})`,
          turnIndex: i,
        });
      }

      const gapMs = time - prevTime;
      if (gapMs > 10 * 60 * 1000) {
        issues.push({
          type: "timestamp_anomaly",
          severity: "warning",
          message: `${(gapMs / 60000).toFixed(1)} minute gap between turns ${i - 1} and ${i}`,
          turnIndex: i,
        });
      }
    }

    prevTime = time;
  }

  return issues;
}

/**
 * Validate turn indices are sequential with no gaps or duplicates.
 */
export function validateTurnIndices(
  entries: Array<{ role: string; text?: string; content?: string; timestamp?: string }>
): TranscriptIssue[] {
  const issues: TranscriptIssue[] = [];

  // Check for role alternation breaks (interviewer→interviewer or candidate→candidate)
  for (let i = 1; i < entries.length; i++) {
    const prevRole = entries[i - 1].role;
    const currRole = entries[i].role;
    const prevText = entries[i - 1].text || entries[i - 1].content || "";
    const currText = entries[i].text || entries[i].content || "";

    // Skip if either entry is empty (already flagged by empty_fragment check)
    if (!prevText.trim() || !currText.trim()) continue;

    // Candidate→candidate is unusual and may indicate missing interviewer turn
    if (prevRole === "candidate" && currRole === "candidate") {
      issues.push({
        type: "missing_turn_index",
        severity: "warning",
        message: `Consecutive candidate turns at index ${i - 1} and ${i} — possible missing interviewer turn`,
        turnIndex: i,
      });
    }
  }

  return issues;
}

/**
 * Auto-repair a transcript by fixing common issues:
 * - Merge consecutive same-role entries
 * - Remove empty fragments
 * - Sort by timestamp if out of order
 * - Deduplicate exact-match turns
 */
export function repairTranscript(
  entries: Array<{ role: string; text: string; timestamp: string }>
): TranscriptRepairResult {
  const repairs: string[] = [];
  let repaired = [...entries];

  // 1. Remove empty fragments
  const beforeEmpty = repaired.length;
  repaired = repaired.filter((e) => e.text && e.text.trim().length > 0);
  if (repaired.length < beforeEmpty) {
    repairs.push(`Removed ${beforeEmpty - repaired.length} empty fragment(s)`);
  }

  // 2. Deduplicate exact-match turns (same role + text + timestamp)
  const seen = new Set<string>();
  const beforeDedup = repaired.length;
  repaired = repaired.filter((e) => {
    const key = `${e.role}:${e.text}:${e.timestamp}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (repaired.length < beforeDedup) {
    repairs.push(`Removed ${beforeDedup - repaired.length} exact duplicate(s)`);
  }

  // 3. Sort by timestamp if out of order
  let outOfOrder = false;
  for (let i = 1; i < repaired.length; i++) {
    const prev = new Date(repaired[i - 1].timestamp).getTime();
    const curr = new Date(repaired[i].timestamp).getTime();
    if (!isNaN(prev) && !isNaN(curr) && curr < prev) {
      outOfOrder = true;
      break;
    }
  }
  if (outOfOrder) {
    repaired.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    repairs.push("Sorted entries by timestamp (was out of order)");
  }

  // 4. Merge consecutive same-role entries
  const merged: typeof repaired = [];
  for (const entry of repaired) {
    const last = merged[merged.length - 1];
    if (last && last.role === entry.role) {
      last.text = `${last.text} ${entry.text}`;
      last.timestamp = entry.timestamp; // Use later timestamp
      repairs.push(`Merged consecutive ${entry.role} turns`);
    } else {
      merged.push({ ...entry });
    }
  }
  repaired = merged;

  return { repaired, repairs };
}
