/**
 * LLM Misuse Detection
 *
 * Detects patterns that suggest a candidate is using LLM assistance
 * during an interview. Signals are advisory and fed into integrity scoring.
 *
 * Detection methods:
 * - Paste content analysis (length, AI-generated patterns)
 * - Typing speed anomaly detection
 */

/** Common LLM output markers */
const AI_MARKERS = [
  /\bcertainly\b.*\b(here|let me)\b/i,
  /\bI'd be happy to\b/i,
  /\bAs an AI\b/i,
  /\bhere(?:'s| is) (?:a|an|the) (?:comprehensive|detailed|step-by-step)\b/i,
  /\bLet me break (?:this|that) down\b/i,
  /\bIn summary,?\b/i,
  /\b(?:First|Second|Third|Finally),\s/,
];

export interface MisuseSignal {
  type: "llm_misuse_suspected" | "paste_anomaly" | "typing_speed_anomaly";
  confidence: "low" | "medium" | "high";
  description: string;
  evidence: string;
}

/**
 * Analyze pasted content for signs of LLM generation.
 */
export function analyzePasteContent(content: string): MisuseSignal | null {
  if (!content || content.length < 50) return null;

  const signals: string[] = [];

  // Check content length (very long pastes are suspicious)
  if (content.length > 500) {
    signals.push(`Unusually long paste (${content.length} chars)`);
  }

  // Check for AI output markers
  const matchedMarkers = AI_MARKERS.filter((pattern) => pattern.test(content));
  if (matchedMarkers.length >= 2) {
    signals.push(`${matchedMarkers.length} AI-typical phrasing patterns detected`);
  }

  // Check for bullet-point heavy structure
  const bulletLines = content.split("\n").filter((line) =>
    /^\s*[-•*]\s/.test(line) || /^\s*\d+[.)]\s/.test(line)
  );
  if (bulletLines.length >= 4) {
    signals.push(`Highly structured response (${bulletLines.length} bullet points)`);
  }

  if (signals.length === 0) return null;

  const confidence = signals.length >= 3 ? "high" : signals.length >= 2 ? "medium" : "low";

  return {
    type: "llm_misuse_suspected",
    confidence,
    description: `Paste content shows potential LLM generation patterns`,
    evidence: signals.join("; "),
  };
}

/**
 * Analyze typing speed for anomalies.
 * Returns a signal if characters appear faster than humanly possible
 * without a paste event.
 *
 * @param charCount Number of characters that appeared
 * @param elapsedMs Time elapsed in milliseconds
 * @param wasPaste Whether a paste event was detected
 */
export function analyzeTypingSpeed(
  charCount: number,
  elapsedMs: number,
  wasPaste: boolean
): MisuseSignal | null {
  if (wasPaste || charCount < 20 || elapsedMs <= 0) return null;

  const charsPerSecond = (charCount / elapsedMs) * 1000;

  // Average fast typist: ~8-10 chars/sec. Suspicious: >20 chars/sec without paste
  if (charsPerSecond > 20) {
    return {
      type: "typing_speed_anomaly",
      confidence: charsPerSecond > 50 ? "high" : "medium",
      description: `Text appeared at ${Math.round(charsPerSecond)} chars/sec without paste event`,
      evidence: `${charCount} chars in ${elapsedMs}ms (${Math.round(charsPerSecond)} chars/sec)`,
    };
  }

  return null;
}
