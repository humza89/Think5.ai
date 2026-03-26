/**
 * Transcript QA Scorer
 *
 * Programmatic scoring of interview transcripts for quality assurance.
 * Measures: flow realism, probing depth, repetition, signal extraction,
 * acknowledgment variety, and overall recruiter-likeness.
 */

export interface TranscriptEntry {
  role: "interviewer" | "candidate" | string;
  content: string;
  timestamp?: string;
}

export interface QADimensionScore {
  name: string;
  score: number; // 1-10
  weight: number;
  details: string;
}

export interface TranscriptQAResult {
  interviewId: string;
  compositeScore: number;
  dimensions: QADimensionScore[];
  flags: string[];
  summary: string;
}

// ── Scoring Functions ──────────────────────────────────────────────────

/**
 * Score flow realism: how natural do section transitions feel?
 * Checks for transition phrases, section progression, and conversational flow.
 */
export function scoreFlowRealism(transcript: TranscriptEntry[]): QADimensionScore {
  const interviewerTurns = transcript.filter((t) => t.role === "interviewer");
  if (interviewerTurns.length === 0) {
    return { name: "flow_realism", score: 1, weight: 0.20, details: "No interviewer turns found" };
  }

  let score = 5; // baseline
  const details: string[] = [];

  // Check for natural transition phrases
  const transitionPhrases = [
    /let's shift/i, /let's move/i, /let's talk about/i, /let's switch/i,
    /that gives me a good sense/i, /I'd like to explore/i, /let me ask about/i,
    /shifting gears/i, /on a different note/i, /moving on/i, /let's go deeper/i,
  ];

  let transitionCount = 0;
  for (const turn of interviewerTurns) {
    for (const phrase of transitionPhrases) {
      if (phrase.test(turn.content)) {
        transitionCount++;
        break;
      }
    }
  }

  const transitionRatio = transitionCount / Math.max(1, interviewerTurns.length);
  if (transitionRatio >= 0.15) { score += 2; details.push("Good use of natural transitions"); }
  else if (transitionRatio >= 0.08) { score += 1; details.push("Some transitions present"); }
  else { score -= 1; details.push("Few natural transitions detected"); }

  // Check for abrupt topic changes (interviewer asks about unrelated topic without transition)
  let abruptChanges = 0;
  for (let i = 2; i < interviewerTurns.length; i++) {
    const prev = interviewerTurns[i - 1].content.toLowerCase();
    const curr = interviewerTurns[i].content.toLowerCase();
    // Simple heuristic: if no words overlap and no transition phrase, likely abrupt
    const prevWords = new Set(prev.split(/\s+/).filter((w) => w.length > 4));
    const currWords = curr.split(/\s+/).filter((w) => w.length > 4);
    const overlap = currWords.filter((w) => prevWords.has(w)).length;
    const hasTransition = transitionPhrases.some((p) => p.test(curr));
    if (overlap === 0 && !hasTransition && currWords.length > 3) {
      abruptChanges++;
    }
  }

  if (abruptChanges === 0) { score += 1; details.push("No abrupt topic changes"); }
  else if (abruptChanges <= 2) { details.push(`${abruptChanges} potentially abrupt transitions`); }
  else { score -= 1; details.push(`${abruptChanges} abrupt topic changes detected`); }

  // Check opening warmth
  if (interviewerTurns.length > 0) {
    const opening = interviewerTurns[0].content.toLowerCase();
    const warmPhrases = ["thanks for joining", "looking forward", "welcome", "glad to have you", "nice to meet"];
    if (warmPhrases.some((p) => opening.includes(p))) {
      score += 1;
      details.push("Warm opening detected");
    }
  }

  // Check closing
  const lastInterviewer = interviewerTurns[interviewerTurns.length - 1];
  if (lastInterviewer) {
    const closing = lastInterviewer.content.toLowerCase();
    const closePhrases = ["thank you", "concludes", "that wraps", "appreciate your time", "great talking"];
    if (closePhrases.some((p) => closing.includes(p))) {
      score += 1;
      details.push("Professional closing detected");
    }
  }

  return {
    name: "flow_realism",
    score: Math.max(1, Math.min(10, score)),
    weight: 0.20,
    details: details.join("; "),
  };
}

/**
 * Score probing depth: does the interviewer follow up meaningfully?
 */
export function scoreProbingDepth(transcript: TranscriptEntry[]): QADimensionScore {
  let score = 5;
  const details: string[] = [];

  const interviewerTurns = transcript.filter((t) => t.role === "interviewer");

  // Count follow-up patterns
  const followUpPatterns = [
    /what part did you personally/i, /why did you choose/i, /what was the hardest/i,
    /what tradeoffs/i, /what changed because/i, /if you were doing it again/i,
    /can you go deeper/i, /tell me more about/i, /what specifically/i,
    /how did you measure/i, /what was the impact/i, /walk me through/i,
    /you mentioned earlier/i, /help me understand/i, /can you be more specific/i,
  ];

  let followUpCount = 0;
  for (const turn of interviewerTurns) {
    for (const pattern of followUpPatterns) {
      if (pattern.test(turn.content)) {
        followUpCount++;
        break;
      }
    }
  }

  const followUpRatio = followUpCount / Math.max(1, interviewerTurns.length);
  if (followUpRatio >= 0.4) { score += 3; details.push("Excellent follow-up density"); }
  else if (followUpRatio >= 0.25) { score += 2; details.push("Good follow-up frequency"); }
  else if (followUpRatio >= 0.15) { score += 1; details.push("Moderate follow-up frequency"); }
  else { score -= 1; details.push("Low follow-up frequency — mostly standalone questions"); }

  // Check for ownership probing specifically
  const ownershipProbes = interviewerTurns.filter((t) =>
    /personally own|your specific role|you specifically|your contribution/i.test(t.content)
  ).length;

  if (ownershipProbes >= 2) { score += 1; details.push(`${ownershipProbes} ownership probes`); }
  else if (ownershipProbes === 0) { details.push("No ownership probing detected"); }

  // Check for depth chains (3+ consecutive exchanges on same topic)
  let maxChainLength = 0;
  let currentChain = 0;
  for (let i = 1; i < transcript.length; i++) {
    if (transcript[i].role === "interviewer" && transcript[i - 1]?.role === "candidate") {
      const interviewer = transcript[i].content.toLowerCase();
      if (/you mentioned|earlier you said|you just described|going back to|on that point/i.test(interviewer)) {
        currentChain++;
        maxChainLength = Math.max(maxChainLength, currentChain);
      } else {
        currentChain = 0;
      }
    }
  }

  if (maxChainLength >= 3) { score += 1; details.push("Deep follow-up chains detected"); }

  return {
    name: "probing_depth",
    score: Math.max(1, Math.min(10, score)),
    weight: 0.20,
    details: details.join("; "),
  };
}

/**
 * Score repetition: are questions and acknowledgments varied?
 */
export function scoreRepetition(transcript: TranscriptEntry[]): QADimensionScore {
  let score = 8; // Start high, deduct for repetition
  const details: string[] = [];

  const interviewerTurns = transcript.filter((t) => t.role === "interviewer");
  if (interviewerTurns.length < 3) {
    return { name: "repetition", score: 5, weight: 0.15, details: "Too few turns to assess" };
  }

  // Check acknowledgment variety
  const ackPatterns = [
    "great", "interesting", "got it", "that's helpful", "thanks",
    "understood", "good", "nice", "perfect", "excellent", "wonderful",
    "that helps", "that makes sense", "fair enough",
  ];

  const ackCounts: Record<string, number> = {};
  for (const turn of interviewerTurns) {
    const lower = turn.content.toLowerCase();
    for (const ack of ackPatterns) {
      if (lower.startsWith(ack) || lower.includes(`. ${ack}`) || lower.includes(`, ${ack}`)) {
        ackCounts[ack] = (ackCounts[ack] || 0) + 1;
      }
    }
  }

  const maxAckRepeat = Math.max(0, ...Object.values(ackCounts));
  const uniqueAcks = Object.keys(ackCounts).length;

  if (maxAckRepeat > 4) { score -= 3; details.push(`Same acknowledgment used ${maxAckRepeat}x`); }
  else if (maxAckRepeat > 3) { score -= 2; details.push(`Acknowledgment repeated ${maxAckRepeat}x`); }
  else if (maxAckRepeat <= 2 && uniqueAcks >= 3) { score += 1; details.push("Good acknowledgment variety"); }

  // Check question stem variety
  const stems = [
    /^tell me/i, /^walk me/i, /^how did/i, /^what was/i, /^can you/i,
    /^describe/i, /^why did/i, /^what led/i, /^help me/i, /^where did/i,
  ];

  const stemCounts: Record<string, number> = {};
  for (const turn of interviewerTurns) {
    for (const stem of stems) {
      if (stem.test(turn.content)) {
        stemCounts[stem.source] = (stemCounts[stem.source] || 0) + 1;
        break;
      }
    }
  }

  const uniqueStems = Object.keys(stemCounts).length;
  const maxStemRepeat = Math.max(0, ...Object.values(stemCounts));

  if (uniqueStems >= 5) { score += 1; details.push(`${uniqueStems} unique question stems`); }
  else if (uniqueStems <= 2) { score -= 1; details.push("Low question stem variety"); }

  if (maxStemRepeat > 3) { score -= 1; details.push(`Same question stem used ${maxStemRepeat}x`); }

  // Check for near-duplicate questions (Jaccard similarity)
  const questions = interviewerTurns
    .filter((t) => t.content.includes("?"))
    .map((t) => new Set(t.content.toLowerCase().split(/\s+/).filter((w) => w.length > 3)));

  let duplicatePairs = 0;
  for (let i = 0; i < questions.length; i++) {
    for (let j = i + 1; j < questions.length; j++) {
      const intersection = [...questions[i]].filter((w) => questions[j].has(w)).length;
      const union = new Set([...questions[i], ...questions[j]]).size;
      const jaccard = union > 0 ? intersection / union : 0;
      if (jaccard > 0.6) duplicatePairs++;
    }
  }

  if (duplicatePairs === 0) { details.push("No near-duplicate questions"); }
  else if (duplicatePairs <= 2) { score -= 1; details.push(`${duplicatePairs} near-duplicate question pair(s)`); }
  else { score -= 2; details.push(`${duplicatePairs} near-duplicate question pairs — significant repetition`); }

  return {
    name: "repetition",
    score: Math.max(1, Math.min(10, score)),
    weight: 0.15,
    details: details.join("; "),
  };
}

/**
 * Score signal extraction: does the interview surface concrete, measurable evidence?
 */
export function scoreSignalExtraction(transcript: TranscriptEntry[]): QADimensionScore {
  let score = 5;
  const details: string[] = [];

  const candidateTurns = transcript.filter((t) => t.role === "candidate");
  if (candidateTurns.length === 0) {
    return { name: "signal_extraction", score: 1, weight: 0.25, details: "No candidate responses" };
  }

  // Check for concrete examples (numbers, metrics, outcomes)
  const concretePatterns = [
    /\d+%/i, /\d+x/i, /\$\d+/i, /million/i, /thousand/i,
    /reduced.*by/i, /increased.*by/i, /improved.*by/i,
    /saved.*time/i, /led.*team/i, /managed.*people/i,
    /shipped/i, /launched/i, /deployed/i, /built/i, /designed/i,
    /measured/i, /metrics/i, /kpi/i, /roi/i,
  ];

  let concreteCount = 0;
  for (const turn of candidateTurns) {
    for (const pattern of concretePatterns) {
      if (pattern.test(turn.content)) {
        concreteCount++;
        break;
      }
    }
  }

  const concreteRatio = concreteCount / candidateTurns.length;
  if (concreteRatio >= 0.5) { score += 3; details.push("High density of concrete examples"); }
  else if (concreteRatio >= 0.3) { score += 2; details.push("Good concrete example density"); }
  else if (concreteRatio >= 0.15) { score += 1; details.push("Some concrete examples"); }
  else { score -= 1; details.push("Few concrete examples surfaced"); }

  // Check for ownership indicators in candidate responses
  const ownershipIndicators = [
    /\bI built\b/i, /\bI designed\b/i, /\bI led\b/i, /\bI decided\b/i,
    /\bI owned\b/i, /\bmy responsibility/i, /\bI was responsible/i,
    /\bI architected\b/i, /\bI implemented\b/i, /\bmy decision\b/i,
  ];

  let ownershipCount = 0;
  for (const turn of candidateTurns) {
    for (const pattern of ownershipIndicators) {
      if (pattern.test(turn.content)) {
        ownershipCount++;
        break;
      }
    }
  }

  if (ownershipCount >= 3) { score += 1; details.push(`${ownershipCount} ownership indicators`); }
  else if (ownershipCount === 0) { details.push("No ownership language detected"); }

  // Check that interviewer elicited measurable outcomes
  const interviewerTurns = transcript.filter((t) => t.role === "interviewer");
  const outcomeProbes = interviewerTurns.filter((t) =>
    /impact|outcome|result|measure|metric|quantify|numbers/i.test(t.content)
  ).length;

  if (outcomeProbes >= 2) { score += 1; details.push("Interviewer actively probed for measurable outcomes"); }

  return {
    name: "signal_extraction",
    score: Math.max(1, Math.min(10, score)),
    weight: 0.25,
    details: details.join("; "),
  };
}

/**
 * Score acknowledgment variety: how diverse are the interviewer's reactions?
 */
export function scoreAcknowledgmentVariety(transcript: TranscriptEntry[]): QADimensionScore {
  let score = 6;
  const details: string[] = [];

  const interviewerTurns = transcript.filter((t) => t.role === "interviewer");
  if (interviewerTurns.length < 3) {
    return { name: "acknowledgment_variety", score: 5, weight: 0.20, details: "Too few turns" };
  }

  // Extract first sentence of each interviewer turn (typically the acknowledgment)
  const firstSentences = interviewerTurns
    .map((t) => {
      const match = t.content.match(/^[^.!?]+[.!?]/);
      return match ? match[0].toLowerCase().trim() : t.content.split(/\s+/).slice(0, 5).join(" ").toLowerCase();
    })
    .filter((s) => s.length > 0);

  // Check uniqueness
  const uniqueFirstSentences = new Set(firstSentences);
  const uniqueRatio = uniqueFirstSentences.size / Math.max(1, firstSentences.length);

  if (uniqueRatio >= 0.85) { score += 3; details.push("Excellent response variety"); }
  else if (uniqueRatio >= 0.7) { score += 2; details.push("Good response variety"); }
  else if (uniqueRatio >= 0.5) { score += 1; details.push("Moderate response variety"); }
  else { score -= 2; details.push("Low response variety — many repeated openings"); }

  // Check for variety in response types
  const responseTypes = {
    factual: 0,     // "That helps.", "Understood."
    reflective: 0,  // "That's interesting.", "That's a great perspective."
    bridging: 0,    // "That connects to...", "Building on that..."
    empathetic: 0,  // "That sounds challenging.", "I can see why..."
  };

  for (const turn of interviewerTurns) {
    const lower = turn.content.toLowerCase();
    if (/that helps|understood|got it|makes sense/i.test(lower)) responseTypes.factual++;
    if (/interesting|great point|good perspective|thoughtful/i.test(lower)) responseTypes.reflective++;
    if (/connects to|building on|relates to|that ties into/i.test(lower)) responseTypes.bridging++;
    if (/sounds challenging|can see why|must have been|that's tough/i.test(lower)) responseTypes.empathetic++;
  }

  const typesUsed = Object.values(responseTypes).filter((v) => v > 0).length;
  if (typesUsed >= 3) { score += 1; details.push(`${typesUsed} response style types used`); }
  else if (typesUsed <= 1) { score -= 1; details.push("Only 1 response style type detected"); }

  return {
    name: "acknowledgment_variety",
    score: Math.max(1, Math.min(10, score)),
    weight: 0.20,
    details: details.join("; "),
  };
}

/**
 * Compute weighted composite QA score from all dimensions.
 */
export function computeCompositeQAScore(dimensions: QADimensionScore[]): number {
  const totalWeight = dimensions.reduce((sum, d) => sum + d.weight, 0);
  if (totalWeight === 0) return 0;

  const weightedSum = dimensions.reduce((sum, d) => sum + d.score * d.weight, 0);
  return Math.round((weightedSum / totalWeight) * 10) / 10;
}

/**
 * Run full transcript QA scoring pipeline.
 */
export function scoreTranscript(
  interviewId: string,
  transcript: TranscriptEntry[]
): TranscriptQAResult {
  const dimensions = [
    scoreFlowRealism(transcript),
    scoreProbingDepth(transcript),
    scoreRepetition(transcript),
    scoreSignalExtraction(transcript),
    scoreAcknowledgmentVariety(transcript),
  ];

  const compositeScore = computeCompositeQAScore(dimensions);

  // Generate flags for notable issues
  const flags: string[] = [];
  for (const dim of dimensions) {
    if (dim.score <= 3) flags.push(`LOW: ${dim.name} (${dim.score}/10)`);
    if (dim.score >= 9) flags.push(`EXCELLENT: ${dim.name} (${dim.score}/10)`);
  }

  if (compositeScore < 5) flags.push("OVERALL: Below acceptable quality threshold");
  if (compositeScore >= 8) flags.push("OVERALL: Enterprise-grade quality");

  // Generate summary
  const weakDims = dimensions.filter((d) => d.score < 5).map((d) => d.name);
  const strongDims = dimensions.filter((d) => d.score >= 8).map((d) => d.name);

  let summary = `Composite QA Score: ${compositeScore}/10. `;
  if (strongDims.length > 0) summary += `Strengths: ${strongDims.join(", ")}. `;
  if (weakDims.length > 0) summary += `Needs improvement: ${weakDims.join(", ")}. `;
  if (weakDims.length === 0 && strongDims.length > 0) summary += "No major quality concerns.";

  return {
    interviewId,
    compositeScore,
    dimensions,
    flags,
    summary,
  };
}
