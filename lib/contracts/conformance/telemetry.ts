import type { Telemetry } from "../telemetry";
import { guard, type Violations } from "./shared";

/** Verifies context propagation and span lifecycle for any Telemetry implementation. */
export async function runTelemetryConformance(factory: () => Telemetry): Promise<Violations> {
  const violations: Violations = [];
  await guard(async () => {
    const root = factory();
    const child = root.withContext({ tenantId: "t-1", requestId: "r-1" });
    const grandchild = child.withContext({ interviewId: "i-1" });

    if (child.context.tenantId !== "t-1" || child.context.requestId !== "r-1") {
      violations.push("withContext must expose the merged context on the child");
    }
    if (grandchild.context.tenantId !== "t-1" || grandchild.context.interviewId !== "i-1") {
      violations.push("withContext must merge over the parent context, not replace it");
    }
    if (root.context.tenantId !== undefined) violations.push("withContext must not mutate the parent context");

    const span = grandchild.startSpan("conformance.span", { step: 1 });
    if (span.name !== "conformance.span") violations.push("startSpan must return a span carrying its name");
    span.setAttribute("k", "v");
    span.recordException(new Error("boom"));
    span.end("error");
    span.end("ok"); // second end must be ignored, never throw

    grandchild.counter("conformance.counter");
    grandchild.counter("conformance.counter", 2, { a: true });
    grandchild.histogram("conformance.histogram", 12.5, { unit: "ms" });
  }, "telemetry surface", violations);
  return violations;
}
