import { describe, expect, it } from "vitest";
import { InMemoryTelemetry, NoopTelemetry, type Telemetry } from "@/lib/contracts/telemetry";
import { runTelemetryConformance } from "@/lib/contracts/conformance/telemetry";

/** Broken on purpose: withContext replaces instead of merging. */
class ReplacingContextTelemetry extends InMemoryTelemetry {
  withContext(context: Parameters<Telemetry["withContext"]>[0]): Telemetry {
    return new ReplacingContextTelemetry({ ...context });
  }
}

describe("Telemetry conformance", () => {
  it("InMemoryTelemetry conforms", async () => {
    expect(await runTelemetryConformance(() => new InMemoryTelemetry())).toEqual([]);
  });

  it("NoopTelemetry conforms", async () => {
    expect(await runTelemetryConformance(() => new NoopTelemetry())).toEqual([]);
  });

  it("detects an implementation that drops parent context", async () => {
    const violations = await runTelemetryConformance(() => new ReplacingContextTelemetry());
    expect(violations).toContain("withContext must merge over the parent context, not replace it");
  });

  it("InMemoryTelemetry records spans and metrics with merged context", () => {
    const root = new InMemoryTelemetry({ requestId: "r-1" });
    const child = root.withContext({ tenantId: "t-1" });
    const span = child.startSpan("op", { step: 1 });
    span.setAttribute("ok", true);
    span.end();
    child.counter("hits");
    child.histogram("latency", 3, { unit: "ms" });
    expect(root.spans[0]).toMatchObject({ name: "op", context: { requestId: "r-1", tenantId: "t-1" }, attributes: { step: 1, ok: true }, ended: true });
    expect(root.counters[0]).toMatchObject({ name: "hits", value: 1, context: { tenantId: "t-1" } });
    expect(root.histograms[0]).toMatchObject({ name: "latency", value: 3 });
  });
});
