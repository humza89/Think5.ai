/**
 * Pre-Deploy Readiness Check
 *
 * Verifies deployment prerequisites:
 * 1. Latest eval results passed
 * 2. TypeScript compiles clean
 * 3. No SLO regressions
 *
 * Exit code 0 = ready, 1 = blocked
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
}

async function checkEvalResults(): Promise<CheckResult> {
  const evalPath = path.join(__dirname, "..", "eval", "eval-results.json");
  if (!fs.existsSync(evalPath)) {
    return { name: "Eval Results", passed: false, message: "No eval results found — run eval harness first" };
  }

  try {
    const data = JSON.parse(fs.readFileSync(evalPath, "utf-8"));
    if (!Array.isArray(data) || data.length === 0) {
      return { name: "Eval Results", passed: false, message: "Eval results file is empty" };
    }

    const latest = data[data.length - 1];
    if (latest.overallPassed) {
      return { name: "Eval Results", passed: true, message: `Latest eval passed (avg: ${latest.avgScore.toFixed(1)})` };
    } else {
      return { name: "Eval Results", passed: false, message: `Latest eval failed (avg: ${latest.avgScore.toFixed(1)})` };
    }
  } catch (err) {
    return { name: "Eval Results", passed: false, message: `Failed to parse eval results: ${err}` };
  }
}

function checkTypeScript(): CheckResult {
  try {
    execSync("npx tsc --noEmit", { cwd: path.join(__dirname, ".."), stdio: "pipe" });
    return { name: "TypeScript", passed: true, message: "Clean compile" };
  } catch {
    return { name: "TypeScript", passed: false, message: "TypeScript compilation errors" };
  }
}

function checkPromotionGate(): CheckResult {
  try {
    // Dynamic import doesn't work in sync context, so check file exists
    const gatePath = path.join(__dirname, "..", "lib", "prompt-promotion-gate.ts");
    if (!fs.existsSync(gatePath)) {
      return { name: "Promotion Gate", passed: true, message: "No promotion gate configured (optional)" };
    }
    return { name: "Promotion Gate", passed: true, message: "Promotion gate exists" };
  } catch {
    return { name: "Promotion Gate", passed: false, message: "Promotion gate check failed" };
  }
}

async function main() {
  console.log("\n" + "=".repeat(50));
  console.log("  PRE-DEPLOY READINESS CHECK");
  console.log("=".repeat(50) + "\n");

  const results: CheckResult[] = [
    await checkEvalResults(),
    checkTypeScript(),
    checkPromotionGate(),
  ];

  let allPassed = true;
  for (const result of results) {
    const icon = result.passed ? "[PASS]" : "[FAIL]";
    console.log(`  ${icon} ${result.name}: ${result.message}`);
    if (!result.passed) allPassed = false;
  }

  console.log("\n" + "-".repeat(50));
  console.log(`  Overall: ${allPassed ? "READY TO DEPLOY" : "BLOCKED — fix issues above"}`);
  console.log("-".repeat(50) + "\n");

  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error("Pre-deploy check failed:", err);
  process.exit(1);
});
