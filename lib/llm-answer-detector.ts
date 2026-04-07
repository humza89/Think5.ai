/**
 * LLM-generated answer detection.
 * Uses linguistic heuristics to flag potentially AI-generated responses.
 */

import { logger } from "@/lib/logger";

interface DetectionResult {
  score: number;
  signals: DetectionSignal[];
  verdict: "likely_human" | "suspicious" | "likely_ai";
}

interface DetectionSignal {
  type: string;
  weight: number;
  description: string;
}

const LLM_PHRASES = [
  "it's important to note", "it's worth mentioning", "in terms of",
  "leveraging", "utilizing", "comprehensive", "robust", "streamline",
  "facilitate", "delve into", "foster", "navigate the complexities",
  "holistic approach", "synergy", "paradigm",
];

const HUMAN_FILLERS = [
  "um", "uh", "like", "you know", "basically", "honestly",
  "i mean", "sort of", "kind of", "actually", "right",
];

export async function detectLLMAnswer(
  response: string,
  responseTimeMs?: number,
  previousResponses?: string[]
): Promise<DetectionResult> {
  const signals: DetectionSignal[] = [];
  const words = response.toLowerCase().split(/\s+/);
  const wordCount = words.length;

  if (wordCount < 10) {
    return { score: 0, signals: [], verdict: "likely_human" };
  }

  // LLM-characteristic phrases
  let llmPhraseCount = 0;
  for (const phrase of LLM_PHRASES) {
    if (response.toLowerCase().includes(phrase)) llmPhraseCount++;
  }
  if (llmPhraseCount >= 3) {
    signals.push({ type: "LLM_VOCABULARY", weight: 20, description: `${llmPhraseCount} LLM-characteristic phrases detected` });
  }

  // Absence of human fillers
  const fillerCount = HUMAN_FILLERS.reduce((count, filler) => {
    return count + (response.match(new RegExp(`\\b${filler}\\b`, "gi"))?.length || 0);
  }, 0);
  if (wordCount > 50 && fillerCount / wordCount < 0.005) {
    signals.push({ type: "NO_FILLERS", weight: 15, description: "No natural speech fillers in long response" });
  }

  // Uniform sentence structure
  const sentences = response.split(/[.!?]+/).filter(s => s.trim());
  const avgLen = words.length / Math.max(sentences.length, 1);
  if (avgLen > 15 && avgLen < 25 && sentences.length >= 3) {
    const lengths = sentences.map(s => s.trim().split(/\s+/).length);
    const variance = lengths.reduce((sum, l) => sum + Math.pow(l - avgLen, 2), 0) / lengths.length;
    if (Math.sqrt(variance) / avgLen < 0.3) {
      signals.push({ type: "UNIFORM_STRUCTURE", weight: 10, description: "Unusually uniform sentence structure" });
    }
  }

  // List format patterns
  const listPatterns = response.match(/(?:^|\n)\s*(?:\d+[.)]\s|[-•]\s)/gm);
  if (listPatterns && listPatterns.length >= 3) {
    signals.push({ type: "LIST_FORMAT", weight: 15, description: "Structured list format typical of LLM output" });
  }

  // Response timing
  if (responseTimeMs !== undefined) {
    const wps = wordCount / (responseTimeMs / 1000);
    if (wps > 5 && wordCount > 100) {
      signals.push({ type: "FAST_COMPLEX_RESPONSE", weight: 25, description: `${wordCount} words in ${Math.round(responseTimeMs / 1000)}s` });
    }
  }

  // Cross-response vocabulary overlap
  if (previousResponses && previousResponses.length >= 3) {
    const currentVocab = new Set(words);
    const rates = previousResponses.map(prev => {
      const prevWords = new Set(prev.toLowerCase().split(/\s+/));
      let shared = 0;
      for (const w of currentVocab) if (prevWords.has(w)) shared++;
      return shared / currentVocab.size;
    });
    if (rates.reduce((a, b) => a + b, 0) / rates.length > 0.7) {
      signals.push({ type: "VOCABULARY_REPETITION", weight: 10, description: "High vocabulary overlap with previous answers" });
    }
  }

  let totalScore = Math.min(100, signals.reduce((sum, s) => sum + s.weight, 0));

  // For borderline cases, run semantic LLM-based detection for higher accuracy
  if (totalScore >= 25 && totalScore < 70) {
    try {
      const { detectAIResponseSemantic } = await import("@/lib/llm-answer-detector-semantic");
      const semanticResult = await detectAIResponseSemantic(
        response,
        "", // question context not available at this level
        previousResponses
      );
      if (semanticResult.provider !== "heuristic_only") {
        // Blend semantic confidence with heuristic score
        const semanticScore = Math.round(semanticResult.confidence * 100);
        totalScore = Math.round(totalScore * 0.4 + semanticScore * 0.6);
        signals.push({
          type: "SEMANTIC_ANALYSIS",
          weight: 0, // Already blended into totalScore
          description: `Semantic detection: ${semanticResult.isLikelyAI ? "likely AI" : "likely human"} (${Math.round(semanticResult.confidence * 100)}% confidence). Signals: ${semanticResult.signals.join("; ")}`,
        });
      }
    } catch {
      // Semantic detection is supplementary — don't fail the detection pipeline
    }
  }

  const verdict = totalScore >= 50 ? "likely_ai" : totalScore >= 25 ? "suspicious" : "likely_human";

  if (totalScore >= 25) {
    logger.info(`[llm-detector] Score: ${totalScore}, verdict: ${verdict}`);
  }

  return { score: totalScore, signals, verdict };
}
