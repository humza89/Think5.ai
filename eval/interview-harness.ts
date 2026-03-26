/**
 * Interviewer Quality Evaluation Harness
 *
 * Runs interview plans through the AI interviewer, captures outputs,
 * and scores against the quality rubric. Used for regression testing
 * before promoting new prompt/model versions.
 *
 * Usage:
 *   npx tsx eval/interview-harness.ts [--benchmark <name>] [--all] [--runs <n>]
 */

import fs from "fs";
import path from "path";
import { EVAL_DIMENSIONS, QUALITY_THRESHOLDS, computeWeightedScore } from "./scoring-rubric";

interface BenchmarkProfile {
  id: string;
  name: string;
  description: string;
  candidateProfile: {
    name: string;
    role: string;
    level: string;
    yearsExperience: number;
    skills: string[];
    strengths: string[];
    weaknesses: string[];
    background: string;
  };
  interviewConfig: {
    mode: string;
    type: string;
    durationMinutes: number;
  };
  expectedBehavior: {
    minSections: number;
    mustCoverTopics: string[];
    difficultyRange: string[];
    expectedScoreRange: [number, number];
    shouldFollowUpOn: string[];
  };
}

interface EvalResult {
  benchmarkId: string;
  benchmarkName: string;
  runNumber: number;
  timestamp: string;
  dimensionScores: Record<string, number>;
  weightedScore: number;
  passed: boolean;
  details: {
    sectionsGenerated: number;
    topicsCovered: string[];
    topicsMissed: string[];
    hypothesesGenerated: number;
    questionsGenerated: number;
    followUpRatio: number;
  };
  errors: string[];
}

async function loadBenchmarks(): Promise<BenchmarkProfile[]> {
  const benchmarkDir = path.join(__dirname, "benchmarks");
  const files = fs.readdirSync(benchmarkDir).filter((f) => f.endsWith(".json"));

  return files.map((file) => {
    const content = fs.readFileSync(path.join(benchmarkDir, file), "utf-8");
    return JSON.parse(content) as BenchmarkProfile;
  });
}

async function evaluateInterviewPlan(
  benchmark: BenchmarkProfile
): Promise<EvalResult> {
  const errors: string[] = [];
  const dimensionScores: Record<string, number> = {};

  try {
    // Dynamic import to avoid requiring the full app context
    const { generateInterviewPlan } = await import("@/lib/interview-planner");

    // Generate the interview plan for the benchmark candidate
    const candidateProfile = benchmark.candidateProfile;
    const plan = await generateInterviewPlan(
      {
        fullName: candidateProfile.name,
        currentTitle: candidateProfile.role,
        currentCompany: null,
        skills: candidateProfile.skills,
        experienceYears: candidateProfile.yearsExperience,
        resumeText: candidateProfile.background,
      },
      {
        title: candidateProfile.role,
        skillsRequired: candidateProfile.skills,
        skillsPreferred: [],
      },
      [],
      { mode: benchmark.interviewConfig.mode as any }
    );

    if (!plan) {
      errors.push("Interview plan generation returned null");
      return makeFailResult(benchmark, errors);
    }

    const planData = typeof plan === "string" ? JSON.parse(plan) : plan;

    // Evaluate Coverage
    const sections = planData.sections || planData.interviewSections || [];
    const sectionsCount = sections.length;
    const coverageRatio = sectionsCount / benchmark.expectedBehavior.minSections;
    dimensionScores.coverage = Math.min(10, coverageRatio * 8);

    // Evaluate Topic Coverage
    const planText = JSON.stringify(planData).toLowerCase();
    const coveredTopics = benchmark.expectedBehavior.mustCoverTopics.filter(
      (topic) => planText.includes(topic.toLowerCase())
    );
    const missedTopics = benchmark.expectedBehavior.mustCoverTopics.filter(
      (topic) => !planText.includes(topic.toLowerCase())
    );
    const topicCoverageRatio =
      coveredTopics.length / benchmark.expectedBehavior.mustCoverTopics.length;
    dimensionScores.role_calibration = Math.min(10, topicCoverageRatio * 10);

    // Evaluate Hypothesis Generation
    const hypotheses = planData.hypotheses || [];
    dimensionScores.hypothesis_testing = Math.min(
      10,
      hypotheses.length >= 3 ? 8 + Math.min(2, (hypotheses.length - 3) * 0.5) : hypotheses.length * 2.5
    );

    // Evaluate Follow-Up Depth (from plan structure)
    const allQuestions = sections.flatMap(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s: any) => s.questions || s.suggestedQuestions || []
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const followUpQuestions = allQuestions.filter((q: any) =>
      typeof q === "string"
        ? q.toLowerCase().includes("follow") || q.toLowerCase().includes("elaborate")
        : q.isFollowUp || q.type === "follow_up"
    );
    const followUpRatio =
      allQuestions.length > 0 ? followUpQuestions.length / allQuestions.length : 0;
    dimensionScores.depth = Math.min(10, 5 + followUpRatio * 10);

    // Adaptivity — check if plan mentions difficulty calibration
    const hasDifficultyAdaptation =
      planText.includes("adapt") ||
      planText.includes("calibrat") ||
      planText.includes("difficulty") ||
      planText.includes("adjust");
    dimensionScores.adaptivity = hasDifficultyAdaptation ? 7.5 : 5.0;

    // Consistency — single run can't measure this; default to baseline (overridden in multi-run mode)
    dimensionScores.consistency = 7.0;

    // Signal Extraction — check if plan includes ownership/impact probes
    const signalPatterns = ["impact", "measur", "metric", "quantif", "outcome", "result", "ownership", "you personally"];
    const signalMatches = signalPatterns.filter((p) => planText.includes(p)).length;
    dimensionScores.signal_extraction = Math.min(10, 4 + signalMatches * 1.0);

    // False Confidence Detection — check if plan includes verification/challenge patterns
    const challengePatterns = ["verify", "challenge", "probe", "clarify", "inconsisten", "contradict", "elaborate", "specific example"];
    const challengeMatches = challengePatterns.filter((p) => planText.includes(p)).length;
    dimensionScores.false_confidence = Math.min(10, 4 + challengeMatches * 1.0);

    // Realism — check for natural language patterns in plan
    const hasVariedPhrasing = allQuestions.length > 0 &&
      new Set(allQuestions.map((q: string | { text?: string }) =>
        (typeof q === "string" ? q : q.text || "").split(" ").slice(0, 3).join(" ").toLowerCase()
      )).size >= Math.min(allQuestions.length * 0.6, allQuestions.length);
    const hasTransitions = planText.includes("transition") || planText.includes("let's") || planText.includes("shift");
    const realismScore = 5.0 + (hasVariedPhrasing ? 2.0 : 0) + (hasTransitions ? 1.5 : 0) + (followUpRatio > 0.2 ? 1.5 : 0);
    dimensionScores.realism = Math.min(10, realismScore);

    const weightedScore = computeWeightedScore(dimensionScores);

    return {
      benchmarkId: benchmark.id,
      benchmarkName: benchmark.name,
      runNumber: 1,
      timestamp: new Date().toISOString(),
      dimensionScores,
      weightedScore,
      passed: weightedScore >= QUALITY_THRESHOLDS.minimum,
      details: {
        sectionsGenerated: sectionsCount,
        topicsCovered: coveredTopics,
        topicsMissed: missedTopics,
        hypothesesGenerated: hypotheses.length,
        questionsGenerated: allQuestions.length,
        followUpRatio,
      },
      errors,
    };
  } catch (err) {
    errors.push(`Eval failed: ${err instanceof Error ? err.message : String(err)}`);
    return makeFailResult(benchmark, errors);
  }
}

function makeFailResult(benchmark: BenchmarkProfile, errors: string[]): EvalResult {
  return {
    benchmarkId: benchmark.id,
    benchmarkName: benchmark.name,
    runNumber: 1,
    timestamp: new Date().toISOString(),
    dimensionScores: {},
    weightedScore: 0,
    passed: false,
    details: {
      sectionsGenerated: 0,
      topicsCovered: [],
      topicsMissed: benchmark.expectedBehavior.mustCoverTopics,
      hypothesesGenerated: 0,
      questionsGenerated: 0,
      followUpRatio: 0,
    },
    errors,
  };
}

function printResults(results: EvalResult[]): void {
  console.log("\n" + "=".repeat(70));
  console.log("  INTERVIEWER QUALITY EVALUATION REPORT");
  console.log("=".repeat(70));

  for (const result of results) {
    const statusIcon = result.passed ? "[PASS]" : "[FAIL]";
    console.log(`\n${statusIcon} ${result.benchmarkName}`);
    console.log(`  Weighted Score: ${result.weightedScore} / 10`);
    console.log(`  Threshold: ${QUALITY_THRESHOLDS.minimum} (min) | ${QUALITY_THRESHOLDS.target} (target)`);

    if (Object.keys(result.dimensionScores).length > 0) {
      console.log("  Dimension Scores:");
      for (const dim of EVAL_DIMENSIONS) {
        const score = result.dimensionScores[dim.id];
        if (score !== undefined) {
          console.log(`    ${dim.name}: ${score.toFixed(1)}`);
        }
      }
    }

    console.log(`  Sections: ${result.details.sectionsGenerated}`);
    console.log(`  Questions: ${result.details.questionsGenerated}`);
    console.log(`  Hypotheses: ${result.details.hypothesesGenerated}`);
    console.log(`  Topics Covered: ${result.details.topicsCovered.join(", ") || "none"}`);
    if (result.details.topicsMissed.length > 0) {
      console.log(`  Topics Missed: ${result.details.topicsMissed.join(", ")}`);
    }

    if (result.errors.length > 0) {
      console.log(`  Errors: ${result.errors.join("; ")}`);
    }
  }

  const allPassed = results.every((r) => r.passed);
  const avgScore =
    results.length > 0
      ? results.reduce((sum, r) => sum + r.weightedScore, 0) / results.length
      : 0;

  console.log("\n" + "-".repeat(70));
  console.log(`  Overall: ${allPassed ? "PASSED" : "FAILED"} | Avg Score: ${avgScore.toFixed(1)}`);
  console.log("-".repeat(70) + "\n");

  // Drift detection: compare against historical baseline
  const outputPath = path.join(__dirname, "eval-results.json");
  const existingResults = fs.existsSync(outputPath)
    ? JSON.parse(fs.readFileSync(outputPath, "utf-8"))
    : [];

  if (existingResults.length > 0) {
    console.log("\n  DRIFT DETECTION:");
    // Compute historical average per dimension
    const historicalScores: Record<string, number[]> = {};
    for (const run of existingResults) {
      for (const result of run.results) {
        for (const [dimId, score] of Object.entries(result.dimensionScores)) {
          if (!historicalScores[dimId]) historicalScores[dimId] = [];
          historicalScores[dimId].push(score as number);
        }
      }
    }

    let driftWarnings = 0;
    for (const result of results) {
      for (const [dimId, currentScore] of Object.entries(result.dimensionScores)) {
        const history = historicalScores[dimId];
        if (history && history.length >= 2) {
          const historicalAvg = history.reduce((a, b) => a + b, 0) / history.length;
          const driftPercent = historicalAvg > 0
            ? ((historicalAvg - (currentScore as number)) / historicalAvg) * 100
            : 0;
          if (driftPercent > 10) {
            console.log(`    [DRIFT WARNING] ${dimId}: ${(currentScore as number).toFixed(1)} vs historical avg ${historicalAvg.toFixed(1)} (${driftPercent.toFixed(0)}% drop)`);
            driftWarnings++;
          }
        }
      }
    }
    if (driftWarnings === 0) {
      console.log("    No significant drift detected.");
    }
  }

  // Save results to file
  existingResults.push({
    runDate: new Date().toISOString(),
    results,
    overallPassed: allPassed,
    avgScore,
  });
  fs.writeFileSync(outputPath, JSON.stringify(existingResults, null, 2));
  console.log(`\nResults saved to ${outputPath}`);
}

async function runMultipleRuns(
  benchmark: BenchmarkProfile,
  runs: number
): Promise<EvalResult[]> {
  const results: EvalResult[] = [];
  for (let i = 0; i < runs; i++) {
    console.log(`    Run ${i + 1}/${runs}...`);
    const result = await evaluateInterviewPlan(benchmark);
    result.runNumber = i + 1;
    results.push(result);
  }
  return results;
}

function computeConsistencyScore(runResults: EvalResult[]): number {
  if (runResults.length < 2) return 7.0; // Default for single run

  const scores = runResults.map((r) => r.weightedScore);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  if (mean === 0) return 1.0;

  const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length;
  const coeffOfVariation = Math.sqrt(variance) / mean;

  // <5% variance → 9-10, 5-10% → 7-8, 10-15% → 5-6, 15-25% → 3-4, >25% → 1-2
  if (coeffOfVariation < 0.05) return 9 + Math.min(1, (0.05 - coeffOfVariation) * 20);
  if (coeffOfVariation < 0.10) return 7 + (0.10 - coeffOfVariation) * 40;
  if (coeffOfVariation < 0.15) return 5 + (0.15 - coeffOfVariation) * 40;
  if (coeffOfVariation < 0.25) return 3 + (0.25 - coeffOfVariation) * 20;
  return Math.max(1, 2 - (coeffOfVariation - 0.25) * 4);
}

async function main() {
  const isMockMode = process.env.EVAL_MOCK_MODE === "true";
  const isReleaseBranch = (() => {
    try {
      const { execSync } = require("child_process");
      const branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8" }).trim();
      return branch === "main" || branch.startsWith("release/");
    } catch { return false; }
  })();

  // Check for AI provider availability
  if (!isMockMode) {
    const hasGemini = !!process.env.GEMINI_API_KEY;
    const hasClaude = !!process.env.ANTHROPIC_API_KEY;
    if (!hasGemini && !hasClaude) {
      if (isReleaseBranch) {
        console.error("[FAIL] Eval harness on release branch requires GEMINI_API_KEY or ANTHROPIC_API_KEY (or set EVAL_MOCK_MODE=true).");
        process.exit(1);
      }
      console.warn("[SKIP] No AI provider key found. Set GEMINI_API_KEY, ANTHROPIC_API_KEY, or EVAL_MOCK_MODE=true.");
      process.exit(0);
    }
  } else {
    console.log("[MOCK MODE] Using deterministic mock provider for evaluation.");
  }

  const args = process.argv.slice(2);
  const benchmarkFilter = args.includes("--benchmark")
    ? args[args.indexOf("--benchmark") + 1]
    : null;
  const numRuns = args.includes("--runs")
    ? parseInt(args[args.indexOf("--runs") + 1], 10) || 1
    : 1;

  let benchmarks = await loadBenchmarks();
  if (benchmarkFilter) {
    benchmarks = benchmarks.filter(
      (b) => b.id.includes(benchmarkFilter) || b.name.toLowerCase().includes(benchmarkFilter.toLowerCase())
    );
  }

  if (benchmarks.length === 0) {
    console.error("No benchmarks found");
    process.exit(1);
  }

  console.log(`Running eval on ${benchmarks.length} benchmark(s) x ${numRuns} run(s)...`);
  const allResults: EvalResult[] = [];

  for (const benchmark of benchmarks) {
    console.log(`  Evaluating: ${benchmark.name}...`);

    if (numRuns > 1) {
      const runResults = await runMultipleRuns(benchmark, numRuns);
      // Compute real consistency score from cross-run variance
      const consistencyScore = computeConsistencyScore(runResults);

      // Update consistency dimension in each result
      for (const result of runResults) {
        result.dimensionScores.consistency = Math.round(consistencyScore * 10) / 10;
        result.weightedScore = computeWeightedScore(result.dimensionScores);
        result.passed = result.weightedScore >= QUALITY_THRESHOLDS.minimum;
      }

      // Report the median run
      const sorted = [...runResults].sort((a, b) => a.weightedScore - b.weightedScore);
      const median = sorted[Math.floor(sorted.length / 2)];
      allResults.push(median);

      const scores = runResults.map((r) => r.weightedScore);
      console.log(`    Scores: [${scores.map((s) => s.toFixed(1)).join(", ")}] | Consistency: ${consistencyScore.toFixed(1)}`);
    } else {
      const result = await evaluateInterviewPlan(benchmark);
      allResults.push(result);
    }
  }

  printResults(allResults);

  const allPassed = allResults.every((r) => r.passed);
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error("Eval harness failed:", err);
  process.exit(1);
});
