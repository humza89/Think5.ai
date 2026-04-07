/**
 * Prompt Regression Test Framework
 *
 * Runs automated evaluations when prompts or models change.
 * Usage: npx tsx eval/prompt-regression.ts
 */

import { getScorerPromptHash, SCORER_MODEL_VERSION } from "@/lib/gemini";
import { logger } from "@/lib/logger";

interface RegressionTestCase {
  name: string;
  transcript: string;
  expectedScoreRange: { min: number; max: number };
  expectedRecommendation: string[];
  tags: string[];
}

interface RegressionResult {
  testCase: string;
  passed: boolean;
  score: number;
  recommendation: string;
  expectedRange: { min: number; max: number };
  promptHash: string;
  modelVersion: string;
}

const TEST_CASES: RegressionTestCase[] = [
  {
    name: "strong_senior_engineer",
    transcript: `[Interviewer]: Tell me about a complex system you designed.
[Candidate]: I led the design of our real-time data pipeline processing 50M events/day with p99 under 100ms. Chose Kafka with custom partitioning, reduced consumer lag by 80%. Team of 6, delivered in 4 months, 99.99% uptime for 3 years.
[Interviewer]: What was the hardest decision?
[Candidate]: Choosing between eventual and strong consistency for payments. Designed a hybrid — strong for mutations, eventual for analytics. Saved 40% infrastructure costs.`,
    expectedScoreRange: { min: 70, max: 95 },
    expectedRecommendation: ["STRONG_YES", "YES"],
    tags: ["senior", "technical"],
  },
  {
    name: "weak_junior_vague",
    transcript: `[Interviewer]: Describe a project you worked on.
[Candidate]: Yeah I worked on some web stuff. Like a website.
[Interviewer]: What technologies?
[Candidate]: Um, HTML and CSS I think. Maybe JavaScript.
[Interviewer]: Your specific role?
[Candidate]: I just kind of helped out.`,
    expectedScoreRange: { min: 10, max: 35 },
    expectedRecommendation: ["NO", "STRONG_NO"],
    tags: ["junior", "vague"],
  },
  {
    name: "mid_level_behavioral",
    transcript: `[Interviewer]: Tell me about a time you dealt with team conflict.
[Candidate]: Two senior engineers disagreed about REST vs GraphQL. I organized a structured decision session with a matrix evaluating our requirements. We chose GraphQL for mobile, REST for internal. Both felt heard. Developer satisfaction went from 3.2 to 4.1/5 that quarter, velocity up 25%.`,
    expectedScoreRange: { min: 55, max: 80 },
    expectedRecommendation: ["YES", "MAYBE"],
    tags: ["mid-level", "behavioral"],
  },
];

export async function runPromptRegression(): Promise<{
  passed: boolean;
  results: RegressionResult[];
  summary: string;
}> {
  const results: RegressionResult[] = [];
  const promptHash = getScorerPromptHash();

  logger.info(`[prompt-regression] Running ${TEST_CASES.length} cases against ${promptHash}, model ${SCORER_MODEL_VERSION}`);

  for (const testCase of TEST_CASES) {
    try {
      const { generateInterviewReport } = await import("@/lib/gemini");
      const reportData = await generateInterviewReport(
        testCase.transcript as any,
        { fullName: testCase.name } as any,
        null,
        {}
      );

      const score = reportData.overallScore ?? 0;
      const rec = reportData.recommendation;
      const inRange = score >= testCase.expectedScoreRange.min && score <= testCase.expectedScoreRange.max;
      const correctRec = testCase.expectedRecommendation.includes(rec);

      results.push({
        testCase: testCase.name,
        passed: inRange && correctRec,
        score: score,
        recommendation: rec,
        expectedRange: testCase.expectedScoreRange,
        promptHash,
        modelVersion: SCORER_MODEL_VERSION,
      });
    } catch {
      results.push({
        testCase: testCase.name,
        passed: false,
        score: -1,
        recommendation: "ERROR",
        expectedRange: testCase.expectedScoreRange,
        promptHash,
        modelVersion: SCORER_MODEL_VERSION,
      });
    }
  }

  const passCount = results.filter(r => r.passed).length;
  return {
    passed: passCount === results.length,
    results,
    summary: `Prompt regression: ${passCount}/${results.length} passed (prompt: ${promptHash.slice(0, 8)}, model: ${SCORER_MODEL_VERSION})`,
  };
}
