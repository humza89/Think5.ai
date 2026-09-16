/**
 * Interviewer Quality Evaluation Harness
 *
 * Phase 0 note: this harness evaluates the generated interview-plan contract
 * plus the runtime interviewer instructions derived from that plan. The current
 * planner stores `targetQuestions` on sections; it does not pre-generate a
 * `questions[]` array. The old harness treated that valid schema as zero
 * questions and therefore produced false failures in deterministic CI.
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

interface PlanQuestion {
  text?: string;
  isFollowUp?: boolean;
  type?: string;
}

interface PlanSectionLike {
  skillModule?: string;
  category?: string;
  objective?: string;
  targetQuestions?: number;
  questions?: Array<string | PlanQuestion>;
  suggestedQuestions?: Array<string | PlanQuestion>;
}

const TOPIC_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "approach",
  "fundamental",
  "fundamentals",
  "of",
  "the",
  "to",
]);

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function topicMatches(text: string, topic: string): boolean {
  const normalizedTopic = normalize(topic);
  if (!normalizedTopic) return false;
  if (text.includes(normalizedTopic)) return true;

  const tokens = normalizedTopic
    .split(" ")
    .filter((token) => token.length >= 2 && !TOPIC_STOP_WORDS.has(token));
  if (tokens.length === 0) return false;

  const matched = tokens.filter((token) => text.includes(token)).length;
  return matched / tokens.length >= 0.5;
}

function scorePatternReadiness(text: string, patterns: string[], base: number, increment: number, cap = 10): number {
  const matches = patterns.filter((pattern) => text.includes(pattern)).length;
  return Math.min(cap, base + matches * increment);
}

async function loadBenchmarks(): Promise<BenchmarkProfile[]> {
  const benchmarkDir = path.join(__dirname, "benchmarks");
  const files = fs.readdirSync(benchmarkDir).filter((file) => file.endsWith(".json"));

  return files.map((file) => {
    const content = fs.readFileSync(path.join(benchmarkDir, file), "utf-8");
    return JSON.parse(content) as BenchmarkProfile;
  });
}

async function evaluateInterviewPlan(benchmark: BenchmarkProfile): Promise<EvalResult> {
  const errors: string[] = [];
  const dimensionScores: Record<string, number> = {};

  try {
    // Dynamic import keeps the harness isolated from the full Next app runtime.
    const { generateInterviewPlan, planToSystemContext } = await import("@/lib/interview-planner");

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
      // Empty module selection intentionally exercises the deterministic fallback
      // in CI. Provider-backed prompt/model evaluation is a separate eval lane.
      [],
      { mode: benchmark.interviewConfig.mode as never },
    );

    if (!plan) {
      errors.push("Interview plan generation returned null");
      return makeFailResult(benchmark, errors);
    }

    const sections = (plan.sections || []) as PlanSectionLike[];
    const sectionsCount = sections.length;
    const runtimeContext = planToSystemContext(plan);
    const evaluationText = normalize(`${JSON.stringify(plan)} ${runtimeContext}`);

    // Coverage: the deterministic plan must still produce the expected number
    // of sections even when no AI provider is available.
    const coverageRatio = sectionsCount / Math.max(1, benchmark.expectedBehavior.minSections);
    dimensionScores.coverage = Math.min(10, coverageRatio * 8);

    // Role calibration: exact multi-word phrase matching was too brittle. Match
    // meaningful topic tokens and retain a small role-title baseline.
    const coveredTopics = benchmark.expectedBehavior.mustCoverTopics.filter((topic) =>
      topicMatches(evaluationText, topic),
    );
    const missedTopics = benchmark.expectedBehavior.mustCoverTopics.filter(
      (topic) => !topicMatches(evaluationText, topic),
    );
    const topicCoverageRatio = benchmark.expectedBehavior.mustCoverTopics.length > 0
      ? coveredTopics.length / benchmark.expectedBehavior.mustCoverTopics.length
      : 1;
    const roleTitlePresent = topicMatches(evaluationText, candidateProfile.role);
    dimensionScores.role_calibration = Math.min(
      10,
      (roleTitlePresent ? 4 : 2) + topicCoverageRatio * 6,
    );

    // Hypothesis readiness: this is a plan-stage proxy, not a claim that the
    // live interview actually investigated a hypothesis. Runtime evidence evals
    // own that later assertion.
    const hypotheses = plan.hypotheses || [];
    dimensionScores.hypothesis_testing = hypotheses.length >= 3
      ? Math.min(10, 8 + (hypotheses.length - 3) * 0.5)
      : hypotheses.length === 2
        ? 7
        : hypotheses.length === 1
          ? 6
          : 5;

    // Current plan schema records targetQuestions instead of materializing all
    // questions up front. Count explicit questions when present, otherwise use
    // the section targets. This is the schema-drift bug that previously made
    // every deterministic eval report `Questions: 0`.
    const explicitQuestions = sections.flatMap(
      (section) => section.questions || section.suggestedQuestions || [],
    );
    const targetQuestionCount = sections.reduce(
      (sum, section) => sum + Math.max(0, section.targetQuestions || 0),
      0,
    );
    const questionsGenerated = explicitQuestions.length || targetQuestionCount;

    const explicitFollowUps = explicitQuestions.filter((question) =>
      typeof question === "string"
        ? /follow|elaborate|deeper|specific example|trade.?off/i.test(question)
        : Boolean(question.isFollowUp || question.type === "follow_up"),
    ).length;
    const followUpPatterns = [
      "follow up",
      "go deeper",
      "probe",
      "clarify",
      "specific example",
      "trade offs",
    ];
    const runtimeFollowUpSignals = followUpPatterns.filter((pattern) =>
      evaluationText.includes(normalize(pattern)),
    ).length;
    const followUpRatio = explicitQuestions.length > 0
      ? explicitFollowUps / explicitQuestions.length
      : Math.min(1, runtimeFollowUpSignals / 4);
    dimensionScores.depth = Math.min(
      10,
      5 + followUpRatio * 4 + (questionsGenerated >= sectionsCount && sectionsCount > 0 ? 0.5 : 0),
    );

    dimensionScores.adaptivity = scorePatternReadiness(
      evaluationText,
      [
        "increase difficulty",
        "decrease",
        "adapt",
        "calibrat",
        "adjustdifficulty",
        "move to next section",
      ],
      5,
      0.75,
      9,
    );

    // Single-run deterministic baseline. Multi-run mode replaces this score
    // with measured cross-run variance below.
    dimensionScores.consistency = 7.0;

    dimensionScores.signal_extraction = scorePatternReadiness(
      evaluationText,
      ["impact", "measur", "metric", "outcome", "result", "ownership", "specificity", "you personally"],
      4,
      0.75,
      9,
    );

    dimensionScores.false_confidence = scorePatternReadiness(
      evaluationText,
      ["verify", "challenge", "probe", "clarify", "inconsisten", "contradict", "vague", "specific example"],
      4,
      0.75,
      9,
    );

    const realismSignals = [
      "ask one question at a time",
      "acknowledge",
      "greet",
      "thank",
      "transition",
    ];
    dimensionScores.realism = scorePatternReadiness(
      evaluationText,
      realismSignals,
      5,
      0.8,
      9,
    );

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
        questionsGenerated,
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
        if (score !== undefined) console.log(`    ${dim.name}: ${score.toFixed(1)}`);
      }
    }

    console.log(`  Sections: ${result.details.sectionsGenerated}`);
    console.log(`  Questions: ${result.details.questionsGenerated}`);
    console.log(`  Hypotheses: ${result.details.hypothesesGenerated}`);
    console.log(`  Topics Covered: ${result.details.topicsCovered.join(", ") || "none"}`);
    if (result.details.topicsMissed.length > 0) {
      console.log(`  Topics Missed: ${result.details.topicsMissed.join(", ")}`);
    }
    if (result.errors.length > 0) console.log(`  Errors: ${result.errors.join("; ")}`);
  }

  const allPassed = results.every((result) => result.passed);
  const avgScore = results.length > 0
    ? results.reduce((sum, result) => sum + result.weightedScore, 0) / results.length
    : 0;

  console.log("\n" + "-".repeat(70));
  console.log(`  Overall: ${allPassed ? "PASSED" : "FAILED"} | Avg Score: ${avgScore.toFixed(1)}`);
  console.log("-".repeat(70) + "\n");

  const outputPath = path.join(__dirname, "eval-results.json");
  const existingResults = fs.existsSync(outputPath)
    ? JSON.parse(fs.readFileSync(outputPath, "utf-8"))
    : [];

  if (existingResults.length > 0) {
    console.log("\n  DRIFT DETECTION:");
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
            console.log(
              `    [DRIFT WARNING] ${dimId}: ${(currentScore as number).toFixed(1)} vs historical avg ${historicalAvg.toFixed(1)} (${driftPercent.toFixed(0)}% drop)`,
            );
            driftWarnings++;
          }
        }
      }
    }
    if (driftWarnings === 0) console.log("    No significant drift detected.");
  }

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
  runs: number,
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
  if (runResults.length < 2) return 7.0;

  const scores = runResults.map((result) => result.weightedScore);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  if (mean === 0) return 1.0;

  const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
  const coeffOfVariation = Math.sqrt(variance) / mean;

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
    } catch {
      return false;
    }
  })();

  if (!isMockMode) {
    const hasGemini = Boolean(process.env.GEMINI_API_KEY);
    const hasClaude = Boolean(process.env.ANTHROPIC_API_KEY);
    if (!hasGemini && !hasClaude) {
      if (isReleaseBranch) {
        console.error(
          "[FAIL] Eval harness on release branch requires GEMINI_API_KEY or ANTHROPIC_API_KEY (or set EVAL_MOCK_MODE=true).",
        );
        process.exit(1);
      }
      console.warn(
        "[SKIP] No AI provider key found. Set GEMINI_API_KEY, ANTHROPIC_API_KEY, or EVAL_MOCK_MODE=true.",
      );
      process.exit(0);
    }
  } else {
    console.log("[MOCK MODE] Evaluating the deterministic planner/runtime-instruction contract; no AI provider call is made.");
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
      (benchmark) =>
        benchmark.id.includes(benchmarkFilter) ||
        benchmark.name.toLowerCase().includes(benchmarkFilter.toLowerCase()),
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
      const consistencyScore = computeConsistencyScore(runResults);

      for (const result of runResults) {
        result.dimensionScores.consistency = Math.round(consistencyScore * 10) / 10;
        result.weightedScore = computeWeightedScore(result.dimensionScores);
        result.passed = result.weightedScore >= QUALITY_THRESHOLDS.minimum;
      }

      const sorted = [...runResults].sort((a, b) => a.weightedScore - b.weightedScore);
      const median = sorted[Math.floor(sorted.length / 2)];
      allResults.push(median);

      const scores = runResults.map((result) => result.weightedScore);
      console.log(
        `    Scores: [${scores.map((score) => score.toFixed(1)).join(", ")}] | Consistency: ${consistencyScore.toFixed(1)}`,
      );
    } else {
      allResults.push(await evaluateInterviewPlan(benchmark));
    }
  }

  printResults(allResults);
  process.exit(allResults.every((result) => result.passed) ? 0 : 1);
}

main().catch((err) => {
  console.error("Eval harness failed:", err);
  process.exit(1);
});
