/** Small helpers shared by the conformance runners. No test-framework imports. */

export type Violations = string[];

export async function expectRejects(step: () => Promise<unknown>, description: string, violations: Violations): Promise<void> {
  try {
    await step();
    violations.push(`${description}: expected a rejection but the call succeeded`);
  } catch {
    // expected
  }
}

export async function guard(step: () => Promise<void>, description: string, violations: Violations): Promise<void> {
  try {
    await step();
  } catch (error) {
    violations.push(`${description}: threw ${error instanceof Error ? error.message : String(error)}`);
  }
}
