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

    // Consistency — single run can't measure this; default to baseline
    dimensionScores.consistency = 7.0;

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

  // Save results to file
  const outputPath = path.join(__dirname, "eval-results.json");
  const existingResults = fs.existsSync(outputPath)
    ? JSON.parse(fs.readFileSync(outputPath, "utf-8"))
    : [];
  existingResults.push({
    runDate: new Date().toISOString(),
    results,
    overallPassed: allPassed,
    avgScore,
  });
  fs.writeFileSync(outputPath, JSON.stringify(existingResults, null, 2));
  console.log(`Results saved to ${outputPath}`);
}

async function main() {
  const args = process.argv.slice(2);
  const benchmarkFilter = args.includes("--benchmark")
    ? args[args.indexOf("--benchmark") + 1]
    : null;

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

  console.log(`Running eval on ${benchmarks.length} benchmark(s)...`);
  const results: EvalResult[] = [];

  for (const benchmark of benchmarks) {
    console.log(`  Evaluating: ${benchmark.name}...`);
    const result = await evaluateInterviewPlan(benchmark);
    results.push(result);
  }

  printResults(results);

  const allPassed = results.every((r) => r.passed);
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error("Eval harness failed:", err);
  process.exit(1);
});
